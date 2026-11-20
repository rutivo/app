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
export function createVad({ chunkMs, silenceMs = 1100, maxMs = 15000, waitMs = 7000 } = {}) {
  let floor = null;
  let speaking = false;
  let heard = 0;
  let quiet = 0;
  let t = 0;
  return {
    /** Devuelve 'wait' | 'speech' | 'end' | 'timeout' */
    push(rms) {
      t += chunkMs;
      if (floor === null) floor = rms;
      const threshold = Math.max(0.012, floor * 2.6);
      if (rms > threshold) {
        heard += chunkMs;
        quiet = 0;
        if (heard >= 120) speaking = true; // al menos 0,12 s de voz: no es un golpe suelto
      } else {
        quiet += chunkMs;
        if (!speaking) heard = Math.max(0, heard - chunkMs);
        // El suelo de ruido sigue al ruido de fondo, despacio
        floor = floor * 0.95 + rms * 0.05;
      }
      if (speaking && quiet >= silenceMs) return 'end';
      if (t >= maxMs) return speaking ? 'end' : 'timeout';
      if (!speaking && t >= waitMs) return 'timeout';
      return speaking ? 'speech' : 'wait';
    },
    get speaking() { return speaking; },
  };
}

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
export function createMic({ deafMs = 1500, maxMs = 15000 } = {}) {
  let stream = null;
  let ctx = null;
  let source = null;
  let proc = null;
  let session = null;
  let lastChunk = 0;

  /** El audio se crea/activa sin esperar a nada: así ocurre dentro del toque (iPhone lo exige). */
  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx || ctx.state === 'closed') ctx = new AC();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  async function open() {
    ensureCtx();
    if (stream) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
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
      session.chunks.push(new Float32Array(d));
      session.onLevel(rms, session.vad.speaking);
      const state = session.vad.push(rms);
      if (state === 'end' || state === 'timeout') finish(state === 'end');
    };
    source.connect(proc);
    proc.connect(ctx.destination); // necesario en Safari para que procese
  }

  /** Cierra el micro sin tocar la frase que se esté grabando. */
  function teardown() {
    try { proc && proc.disconnect(); source && source.disconnect(); } catch { /* */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
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
      try { await ctx.resume(); } catch { /* se comprueba abajo, con el vigilante */ }
    }
  }

  function finish(ok, error = null) {
    const s = session;
    if (!s) return;
    session = null;
    clearInterval(s.watch);
    if (error) return s.reject(error);
    const all = new Float32Array(s.chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of s.chunks) { all.set(c, o); o += c.length; }
    s.resolve(ok && s.vad.speaking ? resample(all, ctx ? ctx.sampleRate : 48000) : null);
  }

  return {
    get isOpen() { return !!stream; },
    open,
    /**
     * Graba una frase. Devuelve el audio a 16 kHz, o null si no se oyó a nadie.
     * Si el micro no da sonido ni reabriéndolo, falla con DeafMicError.
     */
    async listen(onLevel = () => {}) {
      if (session) finish(false);
      await wake();
      return new Promise((resolve, reject) => {
        const s = { chunks: [], resolve, reject, onLevel, vad: createVad({ chunkMs: (4096 / ctx.sampleRate) * 1000, maxMs }), started: Date.now(), retried: false, busy: false };
        session = s;
        // Vigilante: el detector de voz cuenta el tiempo con el sonido que llega;
        // si no llega nada, aquí se nota, se reabre el micro y, si sigue mudo, se avisa.
        s.watch = setInterval(async () => {
          if (session !== s || s.busy) return;
          const now = Date.now();
          if (now - s.started > maxMs + 3000) return finish(true);
          if (s.chunks.length || now - s.started < deafMs) return;
          if (s.retried) return finish(false, new DeafMicError());
          s.busy = true;
          s.retried = true;
          teardown();
          try {
            await wake();
          } catch (err) {
            s.busy = false;
            return finish(false, err);
          }
          s.started = Date.now();
          s.vad = createVad({ chunkMs: (4096 / ctx.sampleRate) * 1000, maxMs });
          s.busy = false;
        }, 250);
      });
    },
    /** «Ya he terminado» (tocar la bola mientras escucha). */
    stop() { if (session) finish(true); },
    cancel() { if (session) { const s = session; session = null; clearInterval(s.watch); s.resolve(null); } },
    close() {
      this.cancel();
      teardown();
    },
    /** Último momento en que llegó sonido (para pruebas). */
    get lastChunk() { return lastChunk; },
  };
}
