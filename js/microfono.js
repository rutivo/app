// Micrófono propio de Rutivo: graba con supresión de ruido y eco, detecta solo
// cuándo empiezas y terminas de hablar (ajustándose al ruido de fondo) y
// devuelve el audio listo para el reconocedor (16 kHz, mono).

const RATE = 16000;

/** Pasa el audio a 16 kHz (media por bloques: limpia y suficiente para voz). */
export function resample(data, from, to = RATE) {
  if (from === to) return data;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(data.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += data[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

/**
 * Detector de voz por energía con suelo de ruido que se adapta (radio, motor…).
 * Recibe el nivel (RMS) de cada trozo y dice cuándo empieza y acaba la frase.
 */
export function createVad({ chunkMs, silenceMs = 1100, maxMs = 15000, waitMs = 7000, shortMs = 0 } = {}) {
  let floor = null;
  let speaking = false;
  let heard = 0;
  let voiced = 0; // tiempo total con voz (para saber si solo se dijo una palabra)
  let quiet = 0;
  let t = 0;
  return {
    /** Devuelve 'wait' | 'speech' | 'end' | 'timeout' */
    push(rms) {
      t += chunkMs;
      // Ruido de fondo: sale de los momentos tranquilos (si empezaste a hablar
      // nada más abrirse el micro, baja en cuanto haces la primera pausa)
      if (floor === null) floor = rms;
      const on = Math.max(0.012, floor * 2.6); // para empezar a contar como voz
      const off = Math.max(0.009, floor * 1.7); // ya hablando: las palabras más bajas también son voz
      if (rms > (speaking ? off : on)) {
        heard += chunkMs;
        voiced += chunkMs;
        quiet = 0;
        if (heard >= 120) speaking = true; // al menos 0,12 s de voz: no es un golpe suelto
      } else {
        quiet += chunkMs;
        if (!speaking) heard = Math.max(0, heard - chunkMs);
      }
      // El ruido de fondo baja rápido (silencio de verdad) y sube despacio (ruido que aumenta)
      if (rms < floor) floor = floor * 0.7 + rms * 0.3;
      else if (!speaking && rms <= on) floor = floor * 0.85 + rms * 0.15; // antes de hablar: aprende el ruido del coche
      else if (rms < off) floor = floor * 0.97 + rms * 0.03;
      // Si solo has dicho una palabra («apúntame…»), espera un poco más: seguramente sigues
      const need = silenceMs + (voiced < 700 ? shortMs : 0);
      if (speaking && quiet >= need) return 'end';
      if (t >= maxMs) return speaking ? 'end' : 'timeout';
      if (!speaking && t >= waitMs) return 'timeout';
      return speaking ? 'speech' : 'wait';
    },
    get speaking() { return speaking; },
  };
}

// ---------- un solo micro para toda la app ----------
// En iPhone, cada vez que se pide el micro de nuevo puede volver a salir
// «rutivo.github.io quiere acceder al micrófono». Por eso se pide UNA vez y lo
// comparten «Oye Rutivo», manos libres y el asistente. La app no lo apaga nunca
// (ni con la app en segundo plano): así no hay que volver a pedirlo. Solo se
// pierde si lo corta el sistema (llamada, otra app, el iPhone al salir de la
// app…); entonces se pide de nuevo al usarlo.
let shared = null;
let users = 0;
let pending = null;

// «Vivo» = funcionando de verdad: en iPhone el sistema puede dejarlo abierto pero silenciado (muted)
const live = (s) => !!s && s.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted);
const stopShared = () => { if (shared) { shared.getTracks().forEach((t) => t.stop()); shared = null; } };


/** El micro compartido (lo pide solo si no hay uno funcionando). `fresh`: pedir uno nuevo. */
export async function acquireStream(fresh = false) {
  users++;
  try {
    if (fresh) stopShared();
    if (live(shared)) return shared;
    if (!pending) {
      pending = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      }).finally(() => { pending = null; });
    }
    shared = await pending;
    return shared;
  } catch (err) {
    users--;
    throw err;
  }
}

/** Deja de usar el micro compartido (sigue abierto para la próxima vez: sin volver a pedir permiso). */
export function releaseStream() {
  users = Math.max(0, users - 1);
}

/** ¿Hay micro abierto y funcionando? (para pruebas) */
export const sharedLive = () => live(shared);

// ---------- un solo «audio» para toda la app ----------
// En iPhone el audio solo arranca si se activa DENTRO de un toque. El asistente
// se abre con un toque (funciona), pero «Oye Rutivo» arranca solo, sin toque, y
// su audio se quedaba en pausa: el punto naranja encendido y sin oír nada.
// Por eso hay UN audio compartido que se desbloquea con cualquier toque en la
// app y se queda en marcha: así «Oye Rutivo» puede escuchar sin tocar nada.
let sharedCtx = null;

/** El audio compartido (lo crea si hace falta) e intenta ponerlo en marcha. */
export function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
  if (sharedCtx.state !== 'running') sharedCtx.resume().catch(() => {});
  return sharedCtx;
}
export const audioRunning = () => !!sharedCtx && sharedCtx.state === 'running';

if (typeof document !== 'undefined') {
  // Cualquier toque en la app desbloquea el audio (dentro del propio toque, como exige iPhone)
  const unlock = () => { if (!audioRunning() && (window.AudioContext || window.webkitAudioContext)) audioCtx(); };
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });
}

/** Espera a que una promesa se cumpla, como mucho `ms` (en iPhone resume() sin toque no acaba nunca). */
const within = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);

/** El micro está abierto pero no llega sonido (en iPhone, tras hablar el asistente). */
export class DeafMicError extends Error {
  constructor() {
    super('El micrófono no da sonido');
    this.name = 'DeafMicError';
  }
}

/**
 * Micrófono abierto mientras el asistente está abierto (no hay que volver a
 * pedir permiso en cada frase). Si el sistema lo deja mudo (en iPhone pasa
 * cuando el asistente habla), se vuelve a abrir solo.
 */
let capturing = 0; // frases grabándose ahora mismo (en todos los micros)
/** ¿Hay algún micro grabando una frase en este momento? */
export const isCapturing = () => capturing > 0;

export function createMic({ deafMs = 1500, maxMs = 15000, silenceMs = 1100, shortMs = 0 } = {}) {
  let stream = null;
  let ctx = null;
  let source = null;
  let proc = null;
  let session = null;
  let lastChunk = 0;

  /** El audio compartido: se activa sin esperar a nada (si esto ocurre dentro de un toque, iPhone lo deja arrancar). */
  function ensureCtx() {
    ctx = audioCtx();
  }

  let needFresh = false; // tras quedarse mudo: pedir un micro nuevo

  async function open() {
    ensureCtx();
    if (stream) return;
    stream = await acquireStream(needFresh);
    needFresh = false;
    if (!ctx || ctx.state === 'closed') ensureCtx();
    source = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      lastChunk = Date.now();
      if (!session) return;
      const d = e.inputBuffer.getChannelData(0);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / d.length);
      if (rms > 1e-6) session.sound = true; // un micro de verdad siempre capta algo (aunque sea ruido)
      session.chunks.push(new Float32Array(d));
      session.onLevel(rms, session.vad.speaking);
      // Escucha continua: quien escucha puede pedir terminar ya (p. ej. ya oyó «Oye Rutivo»)
      if (session.onChunk && session.onChunk(session.chunks, ctx.sampleRate)) { session.forced = true; return finish(true); }
      const state = session.vad.push(rms);
      if (state === 'end' || state === 'timeout') finish(state === 'end');
    };
    source.connect(proc);
    proc.connect(ctx.destination); // necesario en Safari para que procese
  }

  /** Cierra el micro sin tocar la frase que se esté grabando. */
  function teardown() {
    try { proc && proc.disconnect(); source && source.disconnect(); } catch { /* */ }
    if (stream) releaseStream(); // el micro sigue abierto para los demás (y para no volver a preguntar)
    // El audio compartido NO se cierra: así no hace falta otro toque para volver a escuchar
    stream = ctx = source = proc = null;
  }

  /** ¿Se ha quedado mudo? (pista parada o silenciada por el sistema, o audio interrumpido) */
  function stale() {
    const track = stream && stream.getAudioTracks()[0];
    return !track || track.readyState === 'ended' || track.muted || !ctx || ctx.state === 'closed' || ctx.state === 'interrupted';
  }

  async function wake() {
    if (stream && stale()) teardown();
    ensureCtx(); // antes de cualquier espera
    await open();
    if (ctx.state !== 'running') {
      try { await within(ctx.resume(), 600); } catch { /* se comprueba abajo, con el vigilante */ }
    }
  }

  function finish(ok, error = null) {
    const s = session;
    if (!s) return;
    session = null;
    capturing = Math.max(0, capturing - 1);
    clearInterval(s.watch);
    if (error) return s.reject(error);
    const all = new Float32Array(s.chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of s.chunks) { all.set(c, o); o += c.length; }
    s.resolve(ok && (s.vad.speaking || s.forced) ? resample(all, ctx ? ctx.sampleRate : 48000) : null);
  }

  return {
    get isOpen() { return !!stream; },
    open,
    /**
     * Graba una frase. Devuelve el audio a 16 kHz, o null si no se oyó a nadie.
     * Si el micro no da sonido ni reabriéndolo, falla con DeafMicError.
     */
    async listen(onLevel = () => {}, onChunk = null) {
      if (session) finish(false);
      await wake();
      return new Promise((resolve, reject) => {
        const s = { chunks: [], resolve, reject, onLevel, onChunk, forced: false, vad: createVad({ chunkMs: (4096 / ctx.sampleRate) * 1000, maxMs, silenceMs, shortMs }), started: Date.now(), retried: false, busy: false };
        session = s;
        capturing++;
        // Vigilante: el detector de voz cuenta el tiempo con el sonido que llega;
        // si no llega nada, aquí se nota, se reabre el micro y, si sigue mudo, se avisa.
        s.watch = setInterval(async () => {
          if (session !== s || s.busy) return;
          const now = Date.now();
          if (now - s.started > maxMs + 3000) return finish(true);
          // Mudo: no llega audio, o llega pero es silencio absoluto (iPhone, tras hablar el asistente o volver de segundo plano)
          if (s.sound || now - s.started < deafMs) return;
          if (s.retried) return finish(false, new DeafMicError());
          s.busy = true;
          s.retried = true;
          teardown();
          needFresh = true;
          try {
            await wake();
          } catch (err) {
            s.busy = false;
            return finish(false, err);
          }
          s.started = Date.now();
          s.chunks = [];
          s.vad = createVad({ chunkMs: (4096 / ctx.sampleRate) * 1000, maxMs, silenceMs, shortMs });
          s.busy = false;
        }, 250);
      });
    },
    /** «Ya he terminado» (tocar la bola mientras escucha). */
    stop() { if (session) finish(true); },
    cancel() { if (session) { const s = session; session = null; capturing = Math.max(0, capturing - 1); clearInterval(s.watch); s.resolve(null); } },
    close() {
      this.cancel();
      teardown();
    },
    /** Último momento en que llegó sonido (para pruebas). */
    get lastChunk() { return lastChunk; },
  };
}
