// Sincronización del estado con la nube (Firebase o Claude).
//
// El móvil siempre guarda una copia local (store.js); la nube es la copia
// buena. Los datos se suben troceados por mes/año para enviar solo lo que
// cambia (ver sync/shards.js). Si dos móviles editan a la vez, gana el último en guardar.
import { $ } from './dom.js';
import { LISTS, S, clearLocal, hasLocalData, replaceState, setSaveListener, writeLocal } from './store.js';
import { buildShards, classifyError, joinShards, shardLabel } from './sync/shards.js';

const OWNER_KEY = 'cajaOwner'; // usuario al que pertenecen los datos de este móvil

let remote = null; // almacén: list, put, remove, putPhoto, getPhoto, removePhoto
let lastSent = {}; // trozo → JSON subido la última vez
let busy = false;
let dirty = false;
let pending = false; // hay cambios locales sin subir
let failed = false; // la última subida falló por algo pasajero (sin conexión…): se reintenta
let problems = []; // lo que no se pudo subir y por qué (se avisa; no se pierde nada)
let timer;

/** Lo que no se ha podido sincronizar ahora mismo: [{kind, key, label, num?, bytes?}]. */
export const syncProblems = () => problems.slice();

const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(b / 1024) + ' KB');

/** Mensaje claro para cada problema (siempre dice que los datos siguen en el móvil). */
export function problemText(p) {
  if (p.kind === 'invoice-too-big') return '⚠️ No se pudo sincronizar la factura ' + p.num + ' (' + kb(p.bytes) + ', demasiado grande). Sigue guardada en este móvil.';
  if (p.kind === 'doc-too-big' || p.kind === 'too-big') return '⚠️ No se pudo sincronizar «' + p.label + '»: ocupa demasiado' + (p.bytes ? ' (' + kb(p.bytes) + ')' : '') + '. Sigue guardado en este móvil.';
  if (p.kind === 'too-many-chunks') return '⚠️ No se pudieron sincronizar «' + p.label + '»: son demasiadas. Siguen guardadas en este móvil.';
  if (p.kind === 'denied') return '⚠️ No se pudo guardar «' + p.label + '» en tu cuenta (permiso denegado). Tus datos siguen en este móvil; cierra sesión y vuelve a entrar.';
  if (p.kind === 'auth') return '⚠️ Tu sesión ha caducado: no se pudo guardar en tu cuenta. Vuelve a entrar; tus datos siguen en este móvil.';
  if (p.kind === 'quota') return '⚠️ No se pudo guardar ahora (servicio saturado). Se reintentará; tus datos siguen en este móvil.';
  return '⚠️ No se pudo guardar «' + p.label + '» en tu cuenta. Se reintentará; tus datos siguen en este móvil.';
}

function setProblems(list) {
  problems = list.map((p) => ({ ...p, label: p.label || shardLabel(p.key) }));
  try {
    window.dispatchEvent(new CustomEvent('rutivo:sync', { detail: syncProblems() }));
  } catch {
    /* fuera del navegador */
  }
}

/**
 * Estado del guardado. En la pantalla principal solo se enseña si hay algo que
 * atender (sin conexión, error, sin cuenta): cuando todo va bien no molesta.
 */
export function status(text) {
  const el = $('#sync');
  if (!el) return;
  el.textContent = text;
  el.hidden = !/sin conexi|no se pudo|error|solo en este m|copias de seguridad/i.test(text);
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

/**
 * Sube lo que ha cambiado, documento a documento. Un fallo en uno no impide
 * subir los demás. Lo que no cabe o falla no se borra de la nube y se avisa.
 */
async function push() {
  status('Guardando en tu cuenta…');
  S.ts = S.ts || Date.now();
  const { docs, keep, problems: found } = buildShards(S);
  const issues = [...found];
  let offline = false;
  for (const k in docs) {
    if (lastSent[k] === docs[k]) continue;
    try {
      await remote.put(k, { j: docs[k] });
      lastSent[k] = docs[k];
    } catch (err) {
      const kind = classifyError(err, typeof navigator === 'undefined' || navigator.onLine !== false);
      if (kind === 'offline') { offline = true; break; }
      issues.push({ kind, key: k });
    }
  }
  // Solo se borran de la nube los documentos que ya no existen de verdad
  // (nunca los que no se han podido subir ni los que fallaron)
  if (!offline) {
    const failedKeys = new Set(issues.map((x) => x.key));
    for (const k of Object.keys(lastSent)) {
      if (k in docs || keep.includes(k) || failedKeys.has(k)) continue;
      try {
        await remote.remove(k);
        delete lastSent[k];
      } catch (err) {
        if (classifyError(err) === 'offline') { offline = true; break; }
      }
    }
  }
  // La marca de «última versión» solo se actualiza si TODO está en la nube:
  // así otro móvil nunca sustituye sus datos por una copia incompleta.
  if (!offline && !issues.length) {
    try {
      await remote.put('meta', { ts: S.ts });
    } catch (err) {
      if (classifyError(err) === 'offline') offline = true;
      else issues.push({ kind: classifyError(err), key: 'meta' });
    }
  }
  setProblems(issues);
  failed = offline || issues.some((x) => ['quota', 'unknown'].includes(x.kind));
  if (offline) status('Sin conexión: los cambios están en este móvil y se subirán al volver internet.');
  else if (issues.length) status(problemText(problems[0]) + (problems.length > 1 ? ' (y ' + (problems.length - 1) + ' más)' : ''));
  else status('Datos guardados en tu cuenta ✓');
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
  return joinShards(await remote.list());
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
  // Con algo sin subir (pendiente, fallido o que no cabe) no se descarga: se perdería lo de este móvil
  if (!remote || pending || busy || failed || problems.length) return;
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

/** Deja de sincronizar (los cambios ya no se suben). */
export function stopSync() {
  remote = null;
  clearTimeout(timer);
  pending = false;
  failed = false;
  problems = [];
  lastSent = {};
  setSaveListener(() => false);
}

/** Desconecta y borra los datos de este móvil (al cerrar sesión). */
export function disconnectAndWipe() {
  stopSync();
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
