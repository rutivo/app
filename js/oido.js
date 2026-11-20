// «Oído» de Rutivo: reconocimiento de voz Whisper dentro del móvil (gratis, sin
// enviar el audio a nadie, mucho mejor con ruido). El modelo (~77 MB) se
// descarga la primera vez y queda guardado. Corre en un hilo aparte.

let worker = null;
let seq = 0;
const waiting = new Map();
let progressCb = () => {};

function start() {
  if (worker) return worker;
  worker = new Worker(new URL('./oidoWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') return progressCb(m);
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.error) w.reject(new Error(m.error));
    else w.resolve(m.text);
  };
  worker.onerror = (e) => {
    for (const w of waiting.values()) w.reject(new Error(e.message || 'oido'));
    waiting.clear();
  };
  return worker;
}

const call = (type, payload, transfer) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    start().postMessage({ id, type, ...payload }, transfer || []);
  });

/** Descarga/prepara el modelo. `onProgress({loaded, total})` mientras baja. */
export function prepareEar(onProgress = () => {}) {
  let last = Date.now();
  progressCb = (p) => { last = Date.now(); onProgress(p); };
  const ready = call('load', { src: self.__rutivoEarSrc || null });
  // Si en 60 s no avanza nada (sin internet, bloqueado…), no quedarse esperando
  const stuck = new Promise((resolve, reject) => {
    const t = setInterval(() => { if (Date.now() - last > 60000) { clearInterval(t); reject(new Error('sin progreso')); } }, 5000);
    ready.then(() => clearInterval(t), () => clearInterval(t));
  });
  return Promise.race([ready, stuck]);
}

/** Frases que Whisper se inventa cuando solo hay ruido o silencio. */
const HALLUCINATIONS = /(subt[ií]tulos? (realizados?|por)|amara\.org|gracias por ver|suscr[ií]bete|www\.|¡?gracias!?$|^\s*\.+\s*$|m[uú]sica|\[.*\])/i;

/** Texto de lo dicho (audio a 16 kHz), o '' si no se entendió nada. */
export async function transcribe(audio, timeoutMs = 45000) {
  let timer;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      // Colgado: se reinicia el oído para que la siguiente frase funcione
      if (worker) worker.terminate();
      worker = null;
      for (const w of waiting.values()) w.reject(new Error('tiempo'));
      waiting.clear();
      reject(new Error('tiempo'));
    }, timeoutMs);
  });
  const raw = await Promise.race([call('transcribe', { audio, src: self.__rutivoEarSrc || null }, [audio.buffer]), limit]).finally(() => clearTimeout(timer));
  const text = String(raw || '').trim();
  return HALLUCINATIONS.test(text) && text.split(' ').length < 6 ? '' : text;
}

export const earSupported = () => typeof Worker !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
