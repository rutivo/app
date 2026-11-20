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

/**
 * Micrófono abierto mientras el asistente está abierto (no hay que volver a
 * pedir permiso ni «despertarlo» en cada frase).
 */
export function createMic() {
  let stream = null;
  let ctx = null;
  let source = null;
  let proc = null;
  let session = null;

  async function open() {
    if (stream) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    source = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
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

  function finish(ok) {
    const s = session;
    if (!s) return;
    session = null;
    const all = new Float32Array(s.chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of s.chunks) { all.set(c, o); o += c.length; }
    s.resolve(ok && s.vad.speaking ? resample(all, ctx.sampleRate) : null);
  }

  return {
    get isOpen() { return !!stream; },
    open,
    /** Graba una frase. Devuelve el audio a 16 kHz, o null si no se oyó a nadie. */
    async listen(onLevel = () => {}) {
      await open();
      if (ctx.state === 'suspended') await ctx.resume();
      if (session) finish(false);
      return new Promise((resolve) => {
        session = { chunks: [], resolve, onLevel, vad: createVad({ chunkMs: (4096 / ctx.sampleRate) * 1000 }) };
      });
    },
    /** «Ya he terminado» (tocar la bola mientras escucha). */
    stop() { if (session) finish(true); },
    cancel() { if (session) { const s = session; session = null; s.resolve(null); } },
    close() {
      this.cancel();
      try { proc && proc.disconnect(); source && source.disconnect(); } catch { /* */ }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      stream = ctx = source = proc = null;
    },
  };
}
