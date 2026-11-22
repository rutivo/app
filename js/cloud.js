// Sincronización del estado con la nube (Firebase o Claude).
//
// El móvil siempre guarda una copia local (store.js); la nube es la copia
// buena. Los datos se suben troceados por mes/año para enviar solo lo que
// cambia (ver sync/shards.js). Varios móviles se fusionan registro a registro
// sin perder nada (ver sync/merge.js), y cada escritura comprueba que nadie
// haya cambiado el documento mientras tanto.
import { $ } from './dom.js';
import * as idb from './localDb.js';
import { LISTS, S, clearLocal, hasLocalData, replaceState, setSaveListener, writeLocal } from './store.js';
import { merge3, sameState, snapshot } from './sync/merge.js';
import { buildShards, classifyError, joinShards, shardLabel } from './sync/shards.js';

const OWNER_KEY = 'cajaOwner'; // usuario al que pertenecen los datos de este móvil

let remote = null; // almacén: list, put, remove, putPhoto, getPhoto, removePhoto
let lastSent = {}; // trozo → JSON subido la última vez
let busy = false;
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

// ---------- base de la fusión (por usuario, en el móvil) ----------
// La «base» es lo último en lo que este móvil y la nube coincidían (solo huellas).
// Con ella se sabe qué ha cambiado en cada lado desde entonces (ver sync/merge.js).

const BASE_KEY = (uid) => 'syncBase:' + uid;
const CONFLICTS_KEY = (uid) => 'syncConflicts:' + uid;
let uidNow = null;
let base = null; // {snap, tombs, metaTs}
let rerenderFn = () => {};

// La base se guarda en el almacén grande del móvil (IndexedDB): con muchos
// registros ocupa cientos de KB y en localStorage competía con los datos.
// Si no hay almacén grande, sigue en localStorage como antes. Perderla nunca
// borra datos: sin base, la fusión une todo y no borra nada.
const parseBase = (txt) => {
  try {
    const b = JSON.parse(txt || 'null');
    return b && b.snap ? b : null;
  } catch {
    return null;
  }
};
async function loadBase(uid) {
  const fromIdb = parseBase(await idb.get('sync', BASE_KEY(uid)));
  if (fromIdb) return fromIdb;
  try {
    return parseBase(localStorage.getItem(BASE_KEY(uid)));
  } catch {
    return null;
  }
}
let baseWrite = Promise.resolve();
let baseReady = Promise.resolve();
function saveBase() {
  if (!uidNow || !base) return baseWrite;
  const key = BASE_KEY(uidNow);
  const txt = JSON.stringify(base); // se copia ya: lo que se guarda es la base de este momento
  // En orden: una escritura no puede adelantar a la anterior
  baseWrite = baseWrite.then(async () => {
    if (await idb.set('sync', key, txt)) {
      try {
        localStorage.removeItem(key); // la copia antigua ya no hace falta
      } catch {
        /* nada */
      }
      return;
    }
    try {
      localStorage.setItem(key, txt);
    } catch {
      /* sin espacio: la próxima vez se fusiona sin base (se une todo, no se borra nada) */
    }
  });
  return baseWrite;
}

/** Cosas cambiadas a la vez en dos móviles: se quedó lo de este y aquí se guarda lo otro. */
export function syncConflicts() {
  try {
    return uidNow ? JSON.parse(localStorage.getItem(CONFLICTS_KEY(uidNow)) || '[]') : [];
  } catch {
    return [];
  }
}
export function clearSyncConflicts() {
  try {
    if (uidNow) localStorage.removeItem(CONFLICTS_KEY(uidNow));
  } catch {
    /* nada */
  }
  notify();
}
function addConflicts(list) {
  if (!list.length || !uidNow) return;
  const at = Date.now();
  const all = [...list.map((c) => ({ ...c, at })), ...syncConflicts()].slice(0, 100);
  try {
    localStorage.setItem(CONFLICTS_KEY(uidNow), JSON.stringify(all));
  } catch {
    /* sin espacio */
  }
}
function notify() {
  try {
    window.dispatchEvent(new CustomEvent('rutivo:sync', { detail: syncProblems() }));
  } catch {
    /* fuera del navegador */
  }
}

/** El estado que sabemos que hay en la nube (según lo último leído o escrito). */
const remoteKnown = () => joinShards(Object.entries(lastSent).map(([id, j]) => ({ id, data: { j } }))).R;

/** Aplica el estado fusionado a la app (sin tocar lo que no cambia). */
function apply(state) {
  for (const k of LISTS) S[k] = state[k];
  S.cfg = state.cfg;
  S.cli = state.cli;
  writeLocal();
  rerenderFn();
}

// ---------- sincronización ----------

const STALE = 'stale';
const isStale = (err) => err && (err.code === STALE || err.code === 'aborted' || err.code === 'failed-precondition');

/**
 * Una pasada de sincronización:
 *  1. Lee solo la marca de versión (1 lectura). Si la nube no ha cambiado desde
 *     la base, no se descarga nada.
 *  2. Si cambió: descarga, fusiona registro a registro con lo de este móvil y lo aplica.
 *  3. Sube lo que ha cambiado, documento a documento y con comprobación: si
 *     otro móvil lo cambió mientras tanto, se vuelve a leer y fusionar (no se pisa).
 *  4. Solo si todo está subido, actualiza la marca de versión.
 * Devuelve {offline, issues}.
 */
async function syncOnce(force = false) {
  await baseReady;
  if (!remote) return { offline: false, issues: [] };
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  for (let attempt = 0; attempt < 4; attempt++) {
    // 1. ¿Ha cambiado la nube?
    let meta;
    try {
      meta = await remote.get('meta');
    } catch (err) {
      return { offline: classifyError(err, online) === 'offline', issues: classifyError(err, online) === 'offline' ? [] : [{ kind: classifyError(err), key: 'meta' }] };
    }
    const metaTs = meta && typeof meta.ts === 'number' ? meta.ts : null;
    let tombs = base ? base.tombs || {} : {};
    if (force || attempt > 0 || !base || base.metaTs !== metaTs || !Object.keys(lastSent).length) {
      // 2. Descargar y fusionar
      let fetched;
      try {
        fetched = joinShards(await remote.list());
      } catch (err) {
        return { offline: classifyError(err, online) === 'offline', issues: [] };
      }
      lastSent = fetched.sent;
      const R = fetched.R;
      const merged = merge3(base ? base.snap : null, S, R, R.del || {});
      tombs = merged.tombs;
      if (!sameState(merged.state, S)) {
        apply(merged.state);
        if (merged.conflicts.length) addConflicts(merged.conflicts);
        status(merged.conflicts.length
          ? '🔀 Cambios de otro móvil juntados. ' + merged.conflicts.length + ' cambiado(s) en los dos: se ha quedado lo de este móvil (detalle en Cuenta).'
          : 'Datos actualizados desde tu cuenta ✓');
      } else if (merged.conflicts.length) addConflicts(merged.conflicts);
      base = { snap: snapshot(R), tombs: R.del || {}, metaTs };
      saveBase();
    } else {
      // La nube no ha cambiado: aun así, lo borrado en este móvil necesita su lápida.
      // Sin ella, otro móvil que aún lo tiene lo vería «faltar sin lápida» y lo recuperaría.
      tombs = merge3(base.snap, S, remoteKnown(), tombs).tombs;
    }
    force = false;

    // 3. Subir lo que ha cambiado: documentos + marca de versión, juntos y de forma atómica.
    //    Si otro móvil escribió desde que leímos la marca, no se escribe nada ('stale'):
    //    se vuelve a leer, fusionar y reintentar. Así nunca se pisa a nadie.
    const { docs, keep, problems: found } = buildShards(S, undefined, { del: tombs });
    const issues = [...found];
    const sets = {};
    for (const k in docs) if (lastSent[k] !== docs[k]) sets[k] = docs[k];
    const deletes = Object.keys(lastSent).filter((k) => k !== 'meta' && !(k in docs) && !keep.includes(k));
    if (!Object.keys(sets).length && !deletes.length) return { offline: false, issues };

    // En lotes de ~8 MB como mucho (límite de Firestore por transacción: 10 MiB)
    const batches = [];
    let cur = { sets: {}, deletes: [], bytes: 0 };
    for (const [k, j] of Object.entries(sets)) {
      if (cur.bytes + j.length > 8e6 && Object.keys(cur.sets).length) { batches.push(cur); cur = { sets: {}, deletes: [], bytes: 0 }; }
      cur.sets[k] = j;
      cur.bytes += j.length;
    }
    cur.deletes = deletes;
    batches.push(cur);

    let ts = metaTs;
    let stale = false;
    const write = async (b) => {
      const newTs = Math.max(Date.now(), (ts || 0) + 1);
      await remote.commit({ sets: Object.fromEntries(Object.entries(b.sets).map(([k, j]) => [k, { j }])), deletes: b.deletes, expectTs: ts, newTs });
      for (const [k, j] of Object.entries(b.sets)) lastSent[k] = j;
      for (const k of b.deletes) delete lastSent[k];
      ts = newTs;
    };
    try {
      for (const b of batches) {
        try {
          await write(b);
        } catch (err) {
          if (isStale(err)) { stale = true; break; }
          const kind = classifyError(err, online);
          if (kind === 'offline') return { offline: true, issues };
          // Algo del lote no se acepta: se prueba documento a documento para que
          // un documento con problemas no impida guardar los demás
          for (const k of [...Object.keys(b.sets), ...b.deletes.map((d) => '\u0000' + d)]) {
            const single = k.startsWith('\u0000') ? { sets: {}, deletes: [k.slice(1)] } : { sets: { [k]: b.sets[k] }, deletes: [] };
            try {
              await write(single);
            } catch (e2) {
              if (isStale(e2)) { stale = true; break; }
              const k2 = classifyError(e2, online);
              if (k2 === 'offline') return { offline: true, issues };
              issues.push({ kind: k2, key: k.replace('\u0000', '') });
            }
          }
          if (stale) break;
        }
      }
    } finally {
      // Lo que ya esté en la nube pasa a ser la base, con su marca de versión
      base = { snap: snapshot(remoteKnown()), tombs, metaTs: ts };
      saveBase();
      if (ts !== metaTs) { S.ts = ts; writeLocal(); } // compatibilidad con versiones anteriores
    }
    if (stale) continue; // otro móvil escribió a la vez: leer, fusionar y reintentar
    return { offline: false, issues };
  }
  return { offline: false, issues: [{ kind: 'busy', key: 'meta' }] };
}

let running = null;
let again = false;
let forceNext = false;

/** Sincroniza (de una en una; si se pide otra mientras tanto, se repite al acabar). */
function requestSync(force = false) {
  if (!remote) return Promise.resolve(true);
  forceNext = forceNext || force;
  if (running) { again = true; return running; }
  busy = true;
  running = (async () => {
    let res = { offline: false, issues: [] };
    do {
      again = false;
      pending = false;
      const f = forceNext;
      forceNext = false;
      try {
        res = await syncOnce(f);
      } catch {
        res = { offline: true, issues: [] };
      }
    } while (again && remote);
    setProblems(res.issues.filter((x) => x.kind !== 'busy'));
    failed = res.offline || res.issues.some((x) => ['quota', 'unknown', 'busy'].includes(x.kind));
    if (res.offline) { pending = true; status('Sin conexión: los cambios están en este móvil y se subirán al volver internet.'); }
    else if (problems.length) status(problemText(problems[0]) + (problems.length > 1 ? ' (y ' + (problems.length - 1) + ' más)' : ''));
    else if (!/juntados|actualizados/.test(($('#sync') || {}).textContent || '')) status('Datos guardados en tu cuenta ✓');
    notify();
    return !failed && !res.offline;
  })().finally(() => {
    running = null;
    busy = false;
  });
  return running;
}

/** Trae YA lo último de la nube (forzado) y sube lo pendiente. true si se pudo. */
export function syncNow() {
  if (!remote) return Promise.resolve(true);
  clearTimeout(timer);
  return requestSync(true);
}

/** Sube los cambios ahora (y trae los de otros móviles). true si todo quedó guardado. */
export async function flush() {
  if (!remote) return true;
  clearTimeout(timer);
  return requestSync();
}

function schedule() {
  if (!remote) return false;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(() => requestSync(), 900);
  return true;
}

/**
 * Primera sincronización al entrar en una cuenta.
 * - Datos de OTRO usuario en este móvil: se borran y se cargan los de la nube.
 * - Datos de antes de tener cuenta, o de este usuario: se FUSIONAN con la nube
 *   (registro a registro; sin base la primera vez se une todo y no se borra nada).
 */
async function firstSync(uid) {
  const owner = getOwner();
  if (owner && owner !== uid) {
    clearLocal();
    replaceState(null);
  }
  uidNow = uid;
  base = null;
  // La base se lee del almacén grande (asíncrono): ninguna sincronización empieza antes
  baseReady = (async () => {
    const loaded = owner === uid ? await loadBase(uid) : null;
    if (uidNow === uid) base = loaded;
  })();
  await baseReady;
  if (uidNow !== uid) return; // se cerró la sesión mientras se leía
  setOwner(uid);
  lastSent = {};
  const ok = await requestSync(true);
  if (ok && !hasLocalData()) status('Cuenta conectada. Aquí se guardarán tus datos ✓');
}

let listenersOn = false;
let pollTimer = null;

/** Conecta el estado a un almacén remoto del usuario `uid`. */
export async function connect(store, uid, rerender) {
  remote = store;
  rerenderFn = rerender;
  setSaveListener(schedule);
  if (!listenersOn) {
    listenersOn = true;
    addEventListener('online', () => requestSync());
    document.addEventListener('visibilitychange', () => { if (remote) requestSync(); });
  }
  clearInterval(pollTimer);
  // Cada minuto, con la app a la vista, mira si otro móvil ha cambiado algo (1 lectura)
  pollTimer = setInterval(() => { if (remote && document.visibilityState === 'visible' && !running) requestSync(); }, 60000);
  try {
    await firstSync(uid);
  } catch {
    status('Sin conexión con tu cuenta: trabajando con los datos de este móvil.');
  }
}

/** Deja de sincronizar (los cambios ya no se suben). */
export function stopSync() {
  remote = null;
  uidNow = null;
  base = null;
  clearInterval(pollTimer);
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

/** Sube la foto y espera: true si quedó guardada en la cuenta. */
export async function uploadPhotoNow(id, dataUrl) {
  if (!remote) return false;
  try {
    await remote.putPhoto(id, dataUrl);
    return true;
  } catch {
    return false;
  }
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

// ---------- enlaces para el cliente ----------

/** ¿Se pueden hacer enlaces cortos? (hace falta la cuenta, para guardarlos en la nube) */
export const canShortLink = () => !!remote;

/** Guarda (o actualiza) el enlace corto. true si quedó guardado. */
export async function saveLink(id, rec, exp) {
  if (!remote) return false;
  try {
    await remote.putLink(id, rec, exp);
    return true;
  } catch {
    return false;
  }
}

export function removeLink(id) {
  if (remote && id) remote.removeLink(id).catch(() => {});
}
