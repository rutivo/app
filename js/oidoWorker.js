// Hilo aparte con Whisper (transformers.js, versión fija). Se carga solo al usar
// el asistente por voz.
//
// Dos tamaños:
//  - «small» (~240 MB, la primera vez): el que entiende las órdenes. Medido con 210
//    grabaciones (35 órdenes, con y sin ruido de coche), acierta bastante más que «base».
//  - «base» (~77 MB): solo para vigilar «Oye Rutivo» en segundo plano (es 3 veces más
//    ligero: no calienta el móvil ni gasta batería mientras esperas), y de reserva si un
//    móvil no puede con «small».
const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/';
let tf = null;

/** Carga transformers.js (versión fija). `src` solo cambia en las pruebas (servidor local). */
async function lib(src) {
  if (!tf) {
    const base = (src && src.lib) || CDN;
    tf = await import(base + 'transformers.min.js');
    tf.env.allowLocalModels = false;
    tf.env.useBrowserCache = true; // el modelo se guarda en el móvil tras la primera descarga
    tf.env.backends.onnx.wasm.wasmPaths = base;
    if (src && src.models) tf.env.remoteHost = src.models;
  }
  return tf;
}

export const MODELS = { small: 'onnx-community/whisper-small', base: 'onnx-community/whisper-base' };
const asr = {};

async function load(src, size) {
  const name = MODELS[size] ? size : 'small';
  if (!asr[name]) {
    const { pipeline } = await lib(src);
    asr[name] = pipeline('automatic-speech-recognition', MODELS[name], {
      dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress') self.postMessage({ type: 'progress', model: name, file: p.file, loaded: p.loaded, total: p.total });
      },
    });
    // Si no se pudo cargar (sin red, sin memoria…), se olvida para poder reintentar
    asr[name].catch(() => { delete asr[name]; });
  }
  return asr[name];
}

self.onmessage = async (e) => {
  const { id, type, audio, src, max, model } = e.data;
  try {
    const p = await load(src, model);
    if (type === 'load') return self.postMessage({ id, text: '' });
    // `max`: tope de palabras (para «Oye Rutivo…» basta con pocas; con ruido, Whisper se inventa frases largas y tarda)
    const out = await p(audio, { language: 'spanish', task: 'transcribe', chunk_length_s: 30, num_beams: 1, ...(max > 0 ? { max_new_tokens: max } : { max_new_tokens: 96 }) });
    self.postMessage({ id, text: out.text || '' });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
