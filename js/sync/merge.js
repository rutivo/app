// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Fusión a tres bandas para sincronizar varios dispositivos sin perder datos.
// Funciones puras (sin navegador ni nube), probadas en tests/merge.test.js.
//
// Cada dispositivo recuerda la «base»: la última versión en la que coincidió con
// la nube (solo huellas, ocupa poco). Al sincronizar se compara base, local y
// nube, registro a registro:
//   - cambiado solo en un lado            → gana ese lado
//   - nuevo en cualquier lado             → se añade
//   - cambiado en los dos                 → se juntan los campos; si chocan,
//                                           gana el local y la otra versión se
//                                           guarda como conflicto (nunca en silencio)
//   - borrado (con «lápida») en un lado   → se borra, salvo que el otro lado lo
//                                           haya cambiado (entonces se conserva y se avisa)
//   - falta en la nube SIN lápida         → NO se borra (p. ej. lo sobrescribió una
//                                           versión antigua de la app)

export const LIST_KEYS = ['mov', 'srv', 'fac', 'gas', 'huc', 'prv', 'jor'];
const TOMB_DAYS = 120; // las lápidas se olvidan pasado este tiempo

/** Huella corta y estable de un valor (cyrb53, base 36). */
export function hash(value) {
  const str = typeof value === 'string' ? value : stable(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** JSON con las claves ordenadas (el mismo objeto da siempre el mismo texto). */
export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/** Huella corta de un campo (para saber qué campo cambió desde la base). */
export const fieldHash = (v) => hash(v).slice(-5);
const fields = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, fieldHash(v)]));

// Formato compacto de cada registro en la base: «huella~campo:h,campo:h» (ocupa ~40 % menos)
const pack = (x) => hash(x) + '~' + Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => k + ':' + fieldHash(x[k])).join(',');
/** Huellas de un registro de la base: {h, f:{campo:h}} (admite el formato compacto). */
export function unpack(v) {
  if (!v || typeof v !== 'string') return v;
  const [h, rest] = v.split('~');
  const f = {};
  for (const part of (rest || '').split(',')) { const i = part.lastIndexOf(':'); if (i > 0) f[part.slice(0, i)] = part.slice(i + 1); }
  return { h, f };
}

/**
 * Base (huellas) de un estado:
 * {lists:{mov:{id:'huella~campo:h,…'}}, cfg:{campo:h}, cli:{clave:h}}.
 */
export function snapshot(state) {
  const lists = {};
  for (const k of LIST_KEYS) {
    lists[k] = {};
    for (const x of state[k] || []) if (x && x.id != null) lists[k][x.id] = pack(x);
  }
  return { lists, cfg: fields(state.cfg), cli: fields(state.cli) };
}

/** Une las lápidas de dos lados y olvida las muy antiguas. */
export function mergeTombs(a = {}, b = {}, now = Date.now()) {
  const out = {};
  const limit = now - TOMB_DAYS * 864e5;
  for (const src of [a, b]) {
    for (const [k, ids] of Object.entries(src || {})) {
      if (!LIST_KEYS.includes(k) || !ids || typeof ids !== 'object') continue;
      for (const [id, t] of Object.entries(ids)) {
        if (typeof t === 'number' && t >= limit) (out[k] ||= {})[id] = Math.max(out[k]?.[id] || 0, t);
      }
    }
  }
  return out;
}

/** Fusión de un objeto campo a campo (cfg, cli, o un registro cambiado en los dos lados). */
function mergeObject(base, local, remote, where, conflicts) {
  const out = {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {}), ...Object.keys(base || {})]);
  for (const k of keys) {
    const hasL = local && k in local && local[k] !== undefined;
    const hasR = remote && k in remote && remote[k] !== undefined;
    const hl = hasL ? fieldHash(local[k]) : null;
    const hr = hasR ? fieldHash(remote[k]) : null;
    const hb = base && k in base ? base[k] : null; // la base guarda huellas
    if (hl === hr) { if (hasL) out[k] = local[k]; continue; }
    if (hb !== null && hl === hb) { if (hasR) out[k] = remote[k]; continue; } // solo cambió la nube (o lo borró)
    if (hb !== null && hr === hb) { if (hasL) out[k] = local[k]; continue; } // solo cambió aquí (o lo borré)
    if (!hasL && hb === null) { out[k] = remote[k]; continue; } // nuevo en la nube
    if (!hasR && hb === null) { out[k] = local[k]; continue; } // nuevo aquí
    // Cambiado en los dos lados de forma distinta: se queda lo de aquí y se apunta lo otro
    if (hasL) out[k] = local[k];
    else if (hasR) out[k] = remote[k]; // borrado aquí pero cambiado en la nube: se conserva
    conflicts.push({ ...where, field: k, local: hasL ? local[k] : null, remote: hasR ? remote[k] : null });
  }
  return out;
}

/**
 * Fusiona `local` y `remote` usando `base` (huellas de snapshot(), o null si no
 * hay: primera vez tras actualizar la app o en un móvil nuevo).
 * `remoteTombs`: lápidas que trae la nube. Devuelve:
 *   state:      el estado fusionado (listas, cfg, cli)
 *   tombs:      lápidas a guardar en la nube (las de la nube + borrados de aquí)
 *   conflicts:  [{list|area, id?, field?, local, remote, kind}] (nada se pierde en silencio)
 */
export function merge3(base, local, remote, remoteTombs = {}, now = Date.now()) {
  const conflicts = [];
  const newTombs = {};
  const state = {};
  for (const k of LIST_KEYS) {
    const B = base ? base.lists[k] || {} : null;
    const L = new Map((local[k] || []).filter((x) => x && x.id != null).map((x) => [x.id, x]));
    const R = new Map((remote[k] || []).filter((x) => x && x.id != null).map((x) => [x.id, x]));
    const T = (remoteTombs && remoteTombs[k]) || {};
    const take = new Map();
    const ids = new Set([...L.keys(), ...R.keys(), ...(B ? Object.keys(B) : [])]);
    for (const id of ids) {
      const l = L.get(id);
      const r = R.get(id);
      const b = B ? unpack(B[id]) : undefined;
      if (l && r) {
        const hl = hash(l);
        const hr = hash(r);
        if (hl === hr || (b && hr === b.h)) take.set(id, l);
        else if (b && hl === b.h) take.set(id, r);
        // Cambiado en los dos lados (o sin base): se juntan campo a campo; si un mismo
        // campo choca, gana lo de aquí y lo otro queda apuntado como conflicto
        else take.set(id, mergeObject(b ? b.f : null, l, r, { list: k, id, kind: 'both-changed' }, conflicts));
      } else if (l) {
        if (b === undefined) take.set(id, l); // nuevo aquí
        else if (T[id]) {
          // Borrado en otro móvil
          if (hash(l) !== b.h) { take.set(id, l); conflicts.push({ list: k, id, kind: 'deleted-there-changed-here', local: l, remote: null }); }
        } else take.set(id, l); // falta en la nube sin lápida: NO se borra
      } else if (r) {
        if (b === undefined) take.set(id, r); // nuevo en la nube
        else if (hash(r) !== b.h) { take.set(id, r); conflicts.push({ list: k, id, kind: 'deleted-here-changed-there', local: null, remote: r }); }
        else (newTombs[k] ||= {})[id] = now; // borrado aquí: lápida
      } else if (b !== undefined && !T[id]) {
        (newTombs[k] ||= {})[id] = now; // borrado en los dos: la lápida se mantiene
      }
    }
    // Orden: el de aquí, y detrás lo nuevo de la nube
    const order = [...L.keys(), ...[...R.keys()].filter((id) => !L.has(id))];
    state[k] = order.filter((id) => take.has(id)).map((id) => take.get(id));
  }
  state.cfg = mergeObject(base ? base.cfg : null, local.cfg || {}, remote.cfg || {}, { area: 'cfg', kind: 'setting' }, conflicts);
  state.cli = mergeObject(base ? base.cli : null, local.cli || {}, remote.cli || {}, { area: 'cli', kind: 'client' }, conflicts);
  const tombs = mergeTombs(remoteTombs, newTombs, now);
  // Una lápida no aplica a un registro que sigue vivo (p. ej. se recuperó)
  for (const k of Object.keys(tombs)) for (const id of Object.keys(tombs[k])) if (state[k].some((x) => x.id === id)) delete tombs[k][id];
  return { state, tombs, conflicts };
}

/** ¿Son iguales dos estados (listas, cfg y cli)? */
export function sameState(a, b) {
  const sa = snapshot(a);
  const sb = snapshot(b);
  return stable(sa) === stable(sb);
}
