// Hilo aparte con Whisper (transformers.js, versión fija). Se carga solo al usar
// el asistente por voz.
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

const MODEL = 'onnx-community/whisper-base';
let asr = null;

async function load(src) {
  if (!asr) {
    const { pipeline } = await lib(src);
    asr = pipeline('automatic-speech-recognition', MODEL, {
      dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
      },
    });
  }
  return asr;
}

self.onmessage = async (e) => {
  const { id, type, audio, src } = e.data;
  try {
    const p = await load(src);
    if (type === 'load') return self.postMessage({ id, text: '' });
    const out = await p(audio, { language: 'spanish', task: 'transcribe', chunk_length_s: 30 });
    self.postMessage({ id, text: out.text || '' });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
