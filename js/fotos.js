// Fotos de los tickets: que quepan en la nube y que lleguen siempre a ella.
//
// Antes, las fotos grandes (más de ~240 KB en texto) solo se guardaban en el
// móvil: al cambiar de móvil o si el navegador borraba los datos, se perdían
// (y no iban en la copia de seguridad). Ahora:
// - cada foto se ajusta (menos tamaño y calidad, lo justo) para que quepa;
// - las que estaban solo en el móvil se suben solas en cuanto hay cuenta y conexión.
import { cloudEnabled, uploadPhotoNow } from './cloud.js';
import { S } from './store.js';
import { getPhotoLocal, savePhotoLocal } from './store.js';

/** Tamaño máximo de una foto (texto data:…) para la nube (el documento de Firestore admite 1 MB; se deja margen). */
export const PHOTO_MAX = 230000;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/**
 * La misma foto, en JPEG, de como mucho `max` caracteres: se reduce poco a poco
 * el tamaño y la calidad hasta que quepa (un ticket sigue leyéndose bien).
 */
export async function fitPhoto(dataUrl, max = PHOTO_MAX) {
  if (!dataUrl || dataUrl.length <= max) return dataUrl;
  const img = await loadImage(dataUrl);
  let side = Math.min(1000, Math.max(img.width, img.height));
  let q = 0.6;
  let out = dataUrl;
  for (let i = 0; i < 10 && out.length > max; i++) {
    const k = side / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; // fondo blanco (un PNG con transparencia saldría negro en JPEG)
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (q > 0.42) q -= 0.06;
    else side = Math.round(side * 0.85);
  }
  return out;
}

// ---------- subir las que faltan ----------
const KEY = 'fotosNube'; // ids de fotos ya subidas a la cuenta
const uploaded = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const markUploaded = (set) => {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* sin espacio: se reintentará */ }
};

let running = null;
/**
 * Sube a la cuenta las fotos que solo están en este móvil (de una en una).
 * Devuelve cuántas se subieron.
 */
export function syncPhotos() {
  if (!cloudEnabled()) return Promise.resolve(0);
  if (running) return running;
  running = (async () => {
    const done = uploaded();
    let n = 0;
    for (const g of S.gas) {
      if (!g.ph || done.has(g.id) || !cloudEnabled()) continue;
      const local = await getPhotoLocal(g.id);
      if (!local) continue; // no está en este móvil (quizá ya está en la cuenta desde otro)
      const fitted = await fitPhoto(local).catch(() => null);
      if (!fitted || fitted.length > PHOTO_MAX) continue;
      if (fitted !== local) await savePhotoLocal(g.id, fitted); // la misma en el móvil y en la nube
      if (await uploadPhotoNow(g.id, fitted)) {
        done.add(g.id);
        markUploaded(done);
        n++;
      } else break; // sin conexión o error: se reintenta más tarde
    }
    return n;
  })().finally(() => { running = null; });
  return running;
}

/** Anota que esta foto ya está en la cuenta (al guardarla y subirla en el momento). */
export function photoUploaded(id) {
  const s = uploaded();
  s.add(id);
  markUploaded(s);
}
