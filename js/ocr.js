// Leer el texto de fotos, capturas, vídeos (grabación de pantalla) y PDF, dentro del móvil.
import { loadScript } from './dom.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int';

/**
 * Prepara una imagen para leerla mejor: tamaño adecuado, gris y, si es una
 * captura en modo oscuro (texto claro sobre fondo oscuro), se invierte.
 */
function prepare(source, w, h) {
  const k = Math.min(1, 1800 / Math.max(w, h)) * (Math.max(w, h) < 900 ? 2 : 1);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, c.width, c.height);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const dark = sum / (d.length / 4) < 110;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (dark) g = 255 - g;
    g = g < 128 ? Math.max(0, g * 0.8) : Math.min(255, g * 1.1); // más contraste
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  x.putImageData(img, 0, 0);
  return c;
}

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(prepare(img, img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });

/** Fotogramas de un vídeo (p. ej. grabación de pantalla), repartidos a lo largo del vídeo. */
async function videoFrames(file, max = 6) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error('video')); });
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
  const n = Math.max(1, Math.min(max, Math.ceil(dur / 1.5)));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? Math.min(0.5, dur / 2) : 0.2 + ((dur - 0.4) * i) / (n - 1);
    await new Promise((resolve) => { v.onseeked = resolve; v.currentTime = Math.max(0, Math.min(dur - 0.05, t)); setTimeout(resolve, 2500); });
    frames.push(prepare(v, v.videoWidth, v.videoHeight));
  }
  URL.revokeObjectURL(url);
  return frames;
}

/** Primera página de un PDF como imagen (pdf.js ya va dentro de la app). */
async function pdfPage(file) {
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const v0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: 1600 / v0.width });
  const c = document.createElement('canvas');
  c.width = vp.width;
  c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}

/** Une el texto de varios fotogramas sin repetir líneas. */
export function mergeTexts(texts) {
  const seen = new Set();
  const out = [];
  for (const t of texts) {
    for (const line of String(t).split('\n')) {
      const k = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(line.trim());
    }
  }
  return out.join('\n');
}

/**
 * Texto de una foto, captura, vídeo o PDF. `status(texto)` va contando el progreso.
 */
export async function readFileText(file, status = () => {}) {
  status('🔎 Preparando…');
  let pages;
  if (file.type.startsWith('video/')) {
    status('🎞️ Sacando imágenes del vídeo…');
    pages = await videoFrames(file);
  } else if (file.type === 'application/pdf') {
    pages = [await pdfPage(file)];
  } else {
    pages = [await loadImage(file)];
  }
  status('🔎 Leyendo… (la primera vez tarda un poco más)');
  await loadScript(TESSERACT);
  const worker = await window.Tesseract.createWorker('spa', 1, { langPath: LANG_PATH });
  const texts = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      if (pages.length > 1) status('🔎 Leyendo imagen ' + (i + 1) + ' de ' + pages.length + '…');
      const { data } = await worker.recognize(pages[i]);
      texts.push(data.text);
    }
  } finally {
    await worker.terminate();
  }
  return mergeTexts(texts);
}
