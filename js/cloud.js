// Sincronización del estado con la nube (Firebase o Claude).
//
// El móvil siempre guarda una copia local (store.js); la nube es la copia
// buena. Los datos se suben troceados por mes/año para enviar solo lo que
// cambia. Si dos móviles editan a la vez, gana el último en guardar.
import { $ } from './dom.js';
import { LISTS, S, clearLocal, hasLocalData, replaceState, setSaveListener, writeLocal } from './store.js';

const OWNER_KEY = 'cajaOwner'; // usuario al que pertenecen los datos de este móvil

let remote = null; // almacén: list, put, remove, putPhoto, getPhoto, removePhoto
let lastSent = {}; // trozo → JSON subido la última vez
let busy = false;
let dirty = false;
let pending = false; // hay cambios locales sin subir
let failed = false; // la última subida falló
let timer;

export function status(text) {
  const el = $('#sync');
  if (el) el.textContent = text;
}

export const cloudEnabled = () => !!remote;
export const hasUnsavedChanges = () => !!remote && (pending || busy || failed);

const getOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
};
const setOwner = (uid) => {
  try {
    localStorage.setItem(OWNER_KEY, uid);
  } catch {
    /* sin almacenamiento */
  }
};
export const localOwner = getOwner;

/** Une dos listas por id; gana `a`. */
const unionById = (a, b) => {
  const m = new Map();
  [...b, ...a].forEach((x) => m.set(x.id, x));
  return [...m.values()];
};

/** Divide el estado en trozos pequeños (por mes o año). */
function shards() {
  const out = { cfg: JSON.stringify({ cfg: S.cfg, cli: S.cli }) };
  const groups = {};
  const add = (prefix, list, keyOf) => list.forEach((x) => (groups[prefix + '-' + keyOf(x)] ||= []).push(x));
  const byMonth = (x) => x.f.slice(0, 7);
  add('mov', S.mov, byMonth);
  add('srv', S.srv, byMonth);
  add('gas', S.gas, byMonth);
  add('huc', S.huc, byMonth);
  add('prv', S.prv, () => 'all');
  add('fac', S.fac, (x) => x.fecha.slice(0, 4));
  for (const k in groups) out[k] = JSON.stringify(groups[k]);
  return out;
}

async function push() {
  try {
    status('Guardando en tu cuenta…');
    S.ts = S.ts || Date.now();
    const docs = shards();
    for (const k in docs) {
      if (lastSent[k] !== docs[k]) {
        await remote.put(k, { j: docs[k] });
        lastSent[k] = docs[k];
      }
    }
    for (const k of Object.keys(lastSent)) {
      if (!(k in docs)) {
        await remote.remove(k);
        delete lastSent[k];
      }
    }
    await remote.put('meta', { ts: S.ts });
    failed = false;
    status('Datos guardados en tu cuenta ✓');
  } catch {
    failed = true;
    status('Sin conexión: los cambios están en este móvil y se subirán al volver internet.');
  }
}

/** Sube los cambios; si llegan más mientras sube, vuelve a subir al acabar. */
export async function flush() {
  if (!remote) return true;
  clearTimeout(timer);
  if (busy) {
    dirty = true;
    while (busy) await new Promise((r) => setTimeout(r, 100));
    return !failed;
  }
  busy = true;
  do {
    dirty = false;
    pending = false;
    await push();
  } while (dirty);
  busy = false;
  return !failed;
}

function schedule() {
  if (!remote) return false;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
  return true;
}

/** Lee todo lo que hay en la nube. */
async function fetchRemote() {
  const docs = await remote.list();
  const meta = docs.find((d) => d.id === 'meta');
  const R = { mov: [], srv: [], fac: [], gas: [], huc: [], prv: [], cli: {}, cfg: null, ts: meta ? meta.data.ts || 0 : 0 };
  const sent = {};
  for (const d of docs) {
    if (d.id === 'meta') continue;
    sent[d.id] = d.data.j;
    const v = JSON.parse(d.data.j);
    if (d.id === 'cfg') {
      R.cfg = v.cfg;
      R.cli = v.cli || {};
    } else R[d.id.split('-')[0]]?.push(...v);
  }
  return { R, sent };
}

function takeRemote(R) {
  LISTS.forEach((k) => (S[k] = R[k]));
  S.cli = R.cli;
  if (R.cfg) S.cfg = R.cfg;
  S.ts = R.ts;
}

/**
 * Primera sincronización al entrar en una cuenta.
 * - Datos de este mismo usuario: gana la copia más reciente.
 * - Datos de antes de tener cuenta: se juntan con los de la nube (migración).
 * - Datos de OTRO usuario en este móvil: se borran y se cargan los de la nube.
 */
async function firstSync(uid, rerender) {
  const owner = getOwner();
  if (owner && owner !== uid) {
    clearLocal();
    replaceState(null);
  }
  const { R, sent } = await fetchRemote();
  lastSent = sent;
  const local = hasLocalData();

  if (local && !owner) {
    // Migración: lo que había en el móvil se suma a la cuenta.
    LISTS.forEach((k) => (S[k] = unionById(S[k] || [], R[k])));
    S.cli = { ...R.cli, ...S.cli };
    if (!S.cfg.nom && R.cfg) S.cfg = R.cfg;
    S.ts = Date.now();
    setOwner(uid);
    writeLocal();
    rerender();
    await flush();
    return;
  }
  setOwner(uid);
  if (R.ts && (!local || R.ts > (S.ts || 0))) {
    takeRemote(R);
    writeLocal();
    rerender();
    status('Datos cargados desde tu cuenta ✓');
  } else if (local) {
    await flush();
  } else {
    status('Cuenta conectada. Aquí se guardarán tus datos ✓');
  }
}

/** Trae los cambios hechos desde otro móvil (si no hay cambios propios pendientes). */
async function refresh(rerender) {
  if (!remote || pending || busy || failed) return;
  try {
    const { R, sent } = await fetchRemote();
    if (R.ts && R.ts > (S.ts || 0)) {
      lastSent = sent;
      takeRemote(R);
      writeLocal();
      rerender();
      status('Datos actualizados desde tu cuenta ✓');
    }
  } catch {
    /* sin conexión: se intentará más tarde */
  }
}

let listenersOn = false;

/** Conecta el estado a un almacén remoto del usuario `uid`. */
export async function connect(store, uid, rerender) {
  remote = store;
  setSaveListener(schedule);
  if (!listenersOn) {
    listenersOn = true;
    addEventListener('online', () => (failed || pending ? flush() : refresh(rerender)));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh(rerender);
      else if (pending) flush();
    });
  }
  try {
    await firstSync(uid, rerender);
  } catch {
    status('Sin conexión con tu cuenta: trabajando con los datos de este móvil.');
  }
}

/** Desconecta y borra los datos de este móvil (al cerrar sesión). */
export function disconnectAndWipe() {
  remote = null;
  clearTimeout(timer);
  pending = false;
  failed = false;
  lastSent = {};
  setSaveListener(() => false);
  clearLocal();
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

// ---------- fotos ----------

/** Las fotos pequeñas también se suben a la cuenta. */
export const canStorePhotoInCloud = (dataUrl) => !!remote && dataUrl.length < 240000;

export function uploadPhoto(id, dataUrl) {
  if (remote) remote.putPhoto(id, dataUrl).catch(() => {});
}

export async function downloadPhoto(id) {
  if (!remote) return null;
  try {
    return await remote.getPhoto(id);
  } catch {
    return null;
  }
}

export function deletePhoto(id) {
  if (remote) remote.removePhoto(id).catch(() => {});
}
