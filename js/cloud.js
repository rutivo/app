// Sincronización con la cuenta de Claude, cuando la app se abre como artefacto
// (window.claude). Fuera de Claude no hace nada: los datos quedan en el móvil.
import { LISTS, S, hasLocalData, save, setSaveListener, writeLocal } from './store.js';
import { $ } from './dom.js';

let DB = null;
let UID = null;
let lastSent = {}; // documento → JSON enviado la última vez
let busy = false;
let dirty = false;
let timer;

const status = (text) => {
  const el = $('#sync');
  if (el) el.textContent = text;
};

const collection = () => DB.collection('data/users/' + UID);

export const cloudEnabled = () => !!DB;

/** Une dos listas por id; gana `a`. */
const unionById = (a, b) => {
  const m = new Map();
  [...b, ...a].forEach((x) => m.set(x.id, x));
  return [...m.values()];
};

/** Divide el estado en documentos pequeños (por mes o año) para subir solo lo que cambia. */
function shards() {
  const out = { cfg: JSON.stringify({ cfg: S.cfg, cli: S.cli }) };
  const groups = {};
  const add = (prefix, list, keyOf) =>
    list.forEach((x) => (groups[prefix + '-' + keyOf(x)] ||= []).push(x));
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
    const col = collection();
    const docs = shards();
    for (const k in docs) {
      if (lastSent[k] !== docs[k]) {
        await col.doc(k).set({ j: docs[k] });
        lastSent[k] = docs[k];
      }
    }
    for (const k of Object.keys(lastSent)) {
      if (!(k in docs)) {
        await col.doc(k).delete();
        delete lastSent[k];
      }
    }
    await col.doc('meta').set({ ts: S.ts });
    status('Datos guardados en tu cuenta ✓');
  } catch {
    status('No se pudo guardar en tu cuenta. Los datos siguen en este móvil.');
  }
}

/** Sube los cambios; si llegan más mientras sube, vuelve a subir al acabar. */
async function flush() {
  if (busy) {
    dirty = true;
    return;
  }
  busy = true;
  do {
    dirty = false;
    await push();
  } while (dirty);
  busy = false;
}

function schedule() {
  if (!DB) return false;
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
  return true;
}

async function pull(rerender) {
  try {
    const snap = await collection().get();
    const meta = snap.docs.find((d) => d.id === 'meta');
    const remoteTs = meta ? meta.data().ts || 0 : 0;
    const local = hasLocalData();

    lastSent = {};
    snap.docs.forEach((d) => {
      if (d.id !== 'meta' && !d.id.startsWith('foto-')) lastSent[d.id] = d.data().j;
    });

    if (remoteTs && (!local || remoteTs > (S.ts || 0))) {
      const R = { mov: [], srv: [], fac: [], gas: [], huc: [], prv: [], cli: {}, cfg: null };
      for (const k in lastSent) {
        const v = JSON.parse(lastSent[k]);
        if (k === 'cfg') {
          R.cfg = v.cfg;
          R.cli = v.cli;
        } else R[k.split('-')[0]].push(...v);
      }
      if (local && !S.ts) {
        // Datos locales antiguos sin marca de tiempo: se mezclan con los de la cuenta.
        LISTS.forEach((k) => (S[k] = unionById(S[k] || [], R[k])));
        S.cli = { ...R.cli, ...S.cli };
        if (!S.cfg.nom && R.cfg) S.cfg = R.cfg;
        S.ts = Date.now();
        await push();
      } else {
        LISTS.forEach((k) => (S[k] = R[k]));
        S.cli = R.cli;
        if (R.cfg) S.cfg = R.cfg;
        S.ts = remoteTs;
        status('Datos cargados desde tu cuenta ✓');
      }
      writeLocal();
      rerender();
    } else if (local) {
      await push();
    } else {
      status('Cuenta conectada. Aquí se guardarán tus datos ✓');
    }
  } catch {
    status('Sin conexión con tu cuenta: los datos están solo en este móvil.');
  }
}

/** Conecta con la cuenta si la app corre dentro de Claude. */
export async function initCloud(rerender) {
  setSaveListener(schedule);
  try {
    if (!window.claude) {
      status('Tus datos se guardan en este dispositivo. Usa la copia de seguridad (Facturas) para pasarlos a otro móvil.');
      return;
    }
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    UID = user ? await user.id() : null;
    if (!db || !UID) {
      status('Sin cuenta de Claude activa: los datos están solo en este móvil.');
      return;
    }
    DB = db;
    await pull(rerender);
  } catch {
    status('Sin conexión con tu cuenta: los datos están solo en este móvil.');
  }
}

// ---------- fotos en la nube ----------

/** Las fotos pequeñas también se suben a la cuenta. */
export const canStorePhotoInCloud = (dataUrl) => !!DB && dataUrl.length < 240000;

export function uploadPhoto(id, dataUrl) {
  if (DB) collection().doc('foto-' + id).set({ d: dataUrl }).catch(() => {});
}

export async function downloadPhoto(id) {
  if (!DB) return null;
  try {
    const snap = await collection().doc('foto-' + id).get();
    return snap.exists ? snap.data().d : null;
  } catch {
    return null;
  }
}

export function deletePhoto(id) {
  if (DB) collection().doc('foto-' + id).delete().catch(() => {});
}
