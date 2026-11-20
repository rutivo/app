// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// pdf.js (lector de PDF), versión fija y servida desde la app. Se carga solo al
// abrir un PDF (no al arrancar). pdf.js 6 solo existe como módulo; se usa la
// versión «legacy» para que funcione también en iPhone con iOS algo antiguo.
import './pdfCompat.js';

const VERSION = '6.4.299';
const BASE = new URL('../vendor/pdfjs-' + VERSION + '/', import.meta.url);

let lib = null;

/** El módulo de pdf.js, ya configurado (con su proceso aparte para leer). */
export async function loadPdfjs() {
  if (!lib) {
    const mod = await import(new URL('pdf.min.mjs', BASE).href);
    // El proceso aparte carga primero la compatibilidad (ver pdfWorker.mjs)
    mod.GlobalWorkerOptions.workerSrc = new URL('./pdfWorker.mjs', import.meta.url).href;
    lib = mod;
  }
  return lib;
}

/**
 * Abre un PDF elegido por el usuario. Opciones seguras: sin evaluar código,
 * sin formularios XFA ni scripts del PDF. `wasmUrl`: descodificadores de imágenes
 * escaneadas (JBIG2, JPEG 2000) para que los tickets escaneados no salgan en blanco.
 */
export async function openPdf(file) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: new URL('wasm/', BASE).href,
    isEvalSupported: false,
    enableXfa: false,
    enableScripting: false,
  }).promise;
}

/** Primera página de un PDF dibujada en un lienzo de `width` píxeles de ancho. */
export async function firstPageCanvas(file, width) {
  const pdf = await openPdf(file);
  try {
    const page = await pdf.getPage(1);
    const v0 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / v0.width });
    const c = document.createElement('canvas');
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
    return c;
  } finally {
    pdf.loadingTask.destroy();
  }
}
