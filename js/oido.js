// «Oído» de Rutivo: reconocimiento de voz Whisper dentro del móvil (gratis, sin
// enviar el audio a nadie). El modelo para las órdenes (~240 MB) se descarga la
// primera vez y queda guardado. Corre en un hilo aparte.

let worker = null;
let seq = 0;
const waiting = new Map();
let progressCb = () => {};

/**
 * Origen de descarga del reconocedor. Solo las pruebas automáticas (en
 * localhost) pueden cambiarlo; en la app publicada se ignora siempre.
 */
const earSrc = () => (['localhost', '127.0.0.1'].includes(location.hostname) && self.__rutivoEarSrc) || null;

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

// Dos tamaños (ver oidoWorker.js): «small» para entender las órdenes y «base» para
// vigilar «Oye Rutivo» y de reserva. Si un móvil no puede con «small» (memoria),
// se usa «base» y la voz sigue funcionando.
const ready = { small: false, base: false };
const loading = {};
let smallBroken = false;

/** El tamaño que se usa para las órdenes ahora mismo. */
export const commandModel = () => (smallBroken ? 'base' : 'small');
export const earReadyFor = (model) => !!ready[model];

/**
 * Descarga/prepara un modelo (`small` por defecto). `onProgress({loaded, total})` mientras baja.
 * Si «small» no se puede cargar, prepara «base» en su lugar.
 */
export function prepareEar(onProgress = () => {}, model = commandModel()) {
  let last = Date.now();
  progressCb = (p) => { last = Date.now(); onProgress(p); };
  if (ready[model]) return Promise.resolve();
  if (!loading[model]) {
    loading[model] = call('load', { src: earSrc(), model }).then(() => { ready[model] = true; }).finally(() => { delete loading[model]; });
  }
  let ok = loading[model];
  if (model === 'small') {
    ok = ok.catch((err) => {
      if (String(err && err.message) === 'sin progreso') throw err;
      smallBroken = true; // este móvil no puede con el grande: el ligero
      return prepareEar(onProgress, 'base');
    });
  }
  // Si en 60 s no avanza nada (sin internet, bloqueado…), no quedarse esperando
  const stuck = new Promise((resolve, reject) => {
    const t = setInterval(() => { if (Date.now() - last > 60000) { clearInterval(t); reject(new Error('sin progreso')); } }, 5000);
    ok.then(() => clearInterval(t), () => clearInterval(t));
  });
  return Promise.race([ok, stuck]);
}

/** Frases que Whisper se inventa cuando solo hay ruido o silencio. */
const HALLUCINATIONS = /(subt[ií]tulos? (realizados?|por)|amara\.org|gracias por ver|suscr[ií]bete|www\.|¡?gracias!?$|^\s*\.+\s*$|m[uú]sica|\[.*\])/i;

/**
 * Texto de lo dicho (audio a 16 kHz), o '' si no se entendió nada. `model`: el tamaño
 * (por defecto, el de las órdenes). Si el grande aún no está listo (se está
 * descargando), se usa el ligero para no hacerte esperar.
 */
export async function transcribe(audio, timeoutMs = 45000, { maxTokens = 0, model = commandModel() } = {}) {
  let use = model;
  if (use === 'small' && !ready.small) {
    if (!loading.small && !smallBroken) prepareEar(() => {}, 'small').catch(() => {});
    if (ready.base || !navigator.onLine) use = 'base';
  }
  let timer;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      // Colgado: se reinicia el oído para que la siguiente frase funcione
      if (worker) worker.terminate();
      worker = null;
      ready.small = false;
      ready.base = false;
      for (const w of waiting.values()) w.reject(new Error('tiempo'));
      waiting.clear();
      reject(new Error('tiempo'));
    }, timeoutMs);
  });
  const backup = use === 'small' ? audio.slice() : null; // por si hay que repetir con el ligero
  let raw;
  try {
    raw = await Promise.race([call('transcribe', { audio, src: earSrc(), max: maxTokens, model: use }, [audio.buffer]), limit]);
  } catch (err) {
    if (!backup || String(err && err.message) === 'tiempo') throw err;
    // El grande ha fallado (p. ej. sin memoria): el ligero, y desde ahora siempre el ligero
    smallBroken = true;
    raw = await Promise.race([call('transcribe', { audio: backup, src: earSrc(), max: maxTokens, model: 'base' }, [backup.buffer]), limit]);
  } finally {
    clearTimeout(timer);
  }
  const text = String(raw || '').trim();
  return HALLUCINATIONS.test(text) && text.split(' ').length < 6 ? '' : text;
}

export const earSupported = () => typeof Worker !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
