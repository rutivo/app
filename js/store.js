// Estado de la aplicación y su persistencia.
//
// IMPORTANTE: la clave de localStorage y la forma de los datos son las mismas
// que en versiones anteriores. Cambiarlas haría perder los datos guardados.
//
// Forma del estado (nombres cortos heredados, se mantienen por compatibilidad):
//   mov  movimientos de caja    {id, f: fecha, t: 'in'|'out', p: pago, i: importe, c: concepto}
//   srv  servicios de transfer  {id, f, h: hora, cl: proveedor, o: origen, d: destino, i, p, n: notas,
//                                pa: pasajero, vu: vuelo, sv: salida vuelo, tl: teléfono,
//                                mid?: id del movimiento de caja, fid?: id de factura}
//   fac  facturas               {id, num, fecha, iva, em: emisor, cl: cliente, items}
//   gas  gasolina               {id, mid, f, i, l: litros, p, s: gasolinera, ph?: tiene foto}
//   huc  hucha                  {id, f, i}
//   prv  proveedores            {id, nom, nif, dir, cp, loc}
//   cli  datos de cliente por nombre {nif, dir}
//   cfg  configuración y datos del emisor
//   ts   marca de tiempo del último cambio

const STORAGE_KEY = 'cajaTransfer';
const BACKUP_KEY = 'lastBackup'; // fecha de la última copia de seguridad
const PHOTO_PREFIX = 'foto_';
const LISTS = ['mov', 'srv', 'fac', 'gas', 'huc', 'prv'];

const emptyState = () => ({
  mov: [], srv: [], fac: [], gas: [], huc: [], prv: [], cli: {},
  cfg: { nom: '', nif: '', dir: '', iva: 10, lic: '', cp: '', loc: '', ico: 'taxi', col: 'azul', hd: 1, hm: 500 },
});

/** Estado global. Se modifica en el sitio para que todos los módulos vean lo mismo. */
export const S = emptyState();

/** Sustituye todo el estado por `data` (null = estado vacío). */
export function replaceState(data) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, data || emptyState());
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(S, JSON.parse(raw));
  } catch {
    /* datos dañados o almacenamiento bloqueado: se empieza vacío */
  }
  if (S.cfg.iva === undefined) S.cfg.iva = 10;
}

/** Guarda en local sin marcar cambio (tras cargar de la nube). */
export function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    return true;
  } catch {
    return false;
  }
}

let onSaved = () => {};
/** Registra qué hacer tras cada guardado (p. ej. sincronizar con la nube). */
export function setSaveListener(fn) {
  onSaved = fn;
}

/**
 * Guarda el estado. Devuelve false solo si no se pudo guardar en ningún sitio
 * (ni en el dispositivo ni en la cuenta).
 */
export function save() {
  S.ts = Date.now();
  const ok = writeLocal();
  const cloud = onSaved();
  return ok || !!cloud;
}

/** Borra del móvil los datos de la app (no la licencia). */
export function clearLocal() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (k === STORAGE_KEY || k.startsWith(PHOTO_PREFIX) || k === 'avFired' || k === BACKUP_KEY) localStorage.removeItem(k);
    }
  } catch {
    /* sin almacenamiento */
  }
}

/** Pide al navegador que no borre los datos de la app por su cuenta. */
export function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch {
    /* no disponible */
  }
}

export function hasLocalData() {
  return LISTS.some((k) => S[k].length > 0) || !!S.cfg.nom;
}

// ---------- fotos de gasolina ----------

export function savePhotoLocal(id, dataUrl) {
  try {
    localStorage.setItem(PHOTO_PREFIX + id, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function getPhotoLocal(id) {
  try {
    return localStorage.getItem(PHOTO_PREFIX + id);
  } catch {
    return null;
  }
}

export function removePhotoLocal(id) {
  try {
    localStorage.removeItem(PHOTO_PREFIX + id);
  } catch {
    /* sin acceso al almacenamiento */
  }
}

// ---------- copia de seguridad ----------

export const exportBackup = () => JSON.stringify(S);

/** Anota que se ha hecho una copia (para el recordatorio). */
export function markBackupDone() {
  try {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  } catch {
    /* sin almacenamiento */
  }
}

/** Días desde la última copia, o null si nunca se hizo. */
export function daysSinceBackup(now = Date.now()) {
  try {
    const t = +localStorage.getItem(BACKUP_KEY);
    return t ? Math.floor((now - t) / 864e5) : null;
  } catch {
    return null;
  }
}

/** Valida y aplica una copia. Lanza un Error si no es válida. */
export function importBackup(text) {
  let data;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error('invalid');
  }
  if (!data || !data.mov || !data.srv || !data.cfg) throw new Error('invalid');

  const base = emptyState();
  replaceState({ ...base, cfg: {}, ...data });
  S.cfg = { iva: 10, ...S.cfg };
  // Las fotos no viajan en la copia: se quita la marca si no están en este dispositivo.
  for (const g of S.gas) if (g.ph && !getPhotoLocal(g.id)) delete g.ph;
  return save();
}

export { LISTS };
