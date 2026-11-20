// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Troceado del estado en documentos de la nube (Firestore). Funciones puras.
//
// Firestore no admite documentos de más de 1 MiB y las reglas de Rutivo
// rechazan textos de 1.000.000 caracteres o más. Las facturas anteriores a
// 2026-11 guardaban una copia completa de los ajustes (incluido el logo, hasta
// ~180 KB), así que unas pocas por año podían superar el límite y la subida
// fallaba sin explicación. Aquí:
//   - las facturas de un año se reparten en varios documentos si hace falta
//     («fac-2026», «fac-2026-1», …; nombres que ya admiten las reglas y que
//     las versiones anteriores de la app ya leen);
//   - nada que no quepa se sube, pero TAMPOCO se borra de la nube, y se avisa;
//   - no se modifica ninguna factura (no se borra información original).

export const MAX_DOC_BYTES = 900000; // margen bajo 1 MiB (Firestore) y 1.000.000 (reglas)
const MAX_CHUNKS = 99; // «fac-2026-99»: el nombre más largo que admiten las reglas

const enc = new TextEncoder();
/** Bytes que ocupa un texto en la nube (UTF-8). */
export const bytesOf = (s) => enc.encode(String(s)).length;

/** Claves de los datos del emisor que una factura necesita de verdad. */
export const ISSUER_KEYS = ['nom', 'nif', 'dir', 'cp', 'loc', 'lic', 'iban', 'ivaMot'];

/**
 * Facturas antiguas: las que llevan una copia completa de los ajustes o un
 * logo dentro. Devuelve [{id, num, fecha, bytes, logoBytes, extraKeys}].
 */
export function legacyInvoices(fac = []) {
  const out = [];
  for (const f of fac) {
    const em = (f && f.em) || {};
    const extraKeys = Object.keys(em).filter((k) => !ISSUER_KEYS.includes(k));
    const logoBytes = typeof em.limg === 'string' ? bytesOf(em.limg) : 0;
    if (extraKeys.length || logoBytes) out.push({ id: f.id, num: f.num, fecha: f.fecha, bytes: bytesOf(JSON.stringify(f)), logoBytes, extraKeys });
  }
  return out;
}

/** Orden estable de las facturas para repartirlas siempre igual. */
const byDate = (a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.num).localeCompare(String(b.num), 'es', { numeric: true }) || String(a.id).localeCompare(String(b.id));

/**
 * Reparte las facturas de un año en documentos que quepan.
 * Devuelve { chunks: [[factura…]…], tooBig: [factura…] }.
 */
export function chunkInvoices(list, max = MAX_DOC_BYTES) {
  const chunks = [];
  const tooBig = [];
  let cur = [];
  let size = 2; // «[]»
  for (const f of [...list].sort(byDate)) {
    const b = bytesOf(JSON.stringify(f)) + 1; // + coma
    if (b + 2 > max) { tooBig.push(f); continue; }
    if (cur.length && size + b > max) { chunks.push(cur); cur = []; size = 2; }
    cur.push(f);
    size += b;
  }
  if (cur.length) chunks.push(cur);
  return { chunks, tooBig };
}

const chunkKey = (year, i) => 'fac-' + year + (i ? '-' + i : '');

/**
 * Trocea el estado en documentos para la nube.
 * Devuelve:
 *   docs:     { clave: texto JSON } para subir;
 *   keep:     [clave…] documentos que NO se pueden subir ahora y que, por tanto,
 *             tampoco se deben borrar de la nube (para no perder su copia);
 *   problems: [{kind, key, bytes, num?, fecha?}] para avisar.
 */
export function buildShards(S, max = MAX_DOC_BYTES) {
  const docs = { cfg: JSON.stringify({ cfg: S.cfg, cli: S.cli }) };
  const keep = [];
  const problems = [];
  const groups = {};
  const add = (prefix, list, keyOf) => (list || []).forEach((x) => (groups[prefix + '-' + keyOf(x)] ||= []).push(x));
  const byMonth = (x) => String(x.f).slice(0, 7);
  add('mov', S.mov, byMonth);
  add('srv', S.srv, byMonth);
  add('gas', S.gas, byMonth);
  add('huc', S.huc, byMonth);
  add('jor', S.jor, byMonth);
  add('prv', S.prv, () => 'all');
  for (const k in groups) docs[k] = JSON.stringify(groups[k]);

  // Facturas: por año, repartidas en varios documentos si no caben en uno
  const years = {};
  for (const f of S.fac || []) (years[String(f.fecha).slice(0, 4)] ||= []).push(f);
  for (const [year, list] of Object.entries(years)) {
    const { chunks, tooBig } = chunkInvoices(list, max);
    for (const f of tooBig) problems.push({ kind: 'invoice-too-big', key: chunkKey(year, 0), num: f.num, fecha: f.fecha, bytes: bytesOf(JSON.stringify(f)) });
    if (chunks.length > MAX_CHUNKS + 1) {
      problems.push({ kind: 'too-many-chunks', key: chunkKey(year, 0), bytes: bytesOf(JSON.stringify(list)) });
      keep.push(...Array.from({ length: MAX_CHUNKS + 1 }, (_, i) => chunkKey(year, i)));
      continue;
    }
    if (tooBig.length) {
      // Si alguna factura no cabe, ese año no se toca en la nube: así no se pierde
      // la copia que hubiera allí (se avisa y sigue guardado en el móvil)
      keep.push(...Array.from({ length: MAX_CHUNKS + 1 }, (_, i) => chunkKey(year, i)));
      continue;
    }
    chunks.forEach((c, i) => { docs[chunkKey(year, i)] = JSON.stringify(c); });
  }

  // Cualquier otro documento demasiado grande: no se sube ni se borra; se avisa
  for (const [key, json] of Object.entries(docs)) {
    const bytes = bytesOf(json);
    if (bytes > max) {
      delete docs[key];
      keep.push(key);
      problems.push({ kind: 'doc-too-big', key, bytes });
    }
  }
  return { docs, keep, problems };
}

/** Lee los documentos de la nube y los junta (admite «fac-2026», «fac-2026-1», …). */
export function joinShards(list) {
  const R = { mov: [], srv: [], fac: [], gas: [], huc: [], prv: [], jor: [], cli: {}, cfg: null, ts: 0 };
  const sent = {};
  for (const d of list) {
    if (d.id === 'meta') { R.ts = (d.data && d.data.ts) || 0; continue; }
    sent[d.id] = d.data.j;
    const v = JSON.parse(d.data.j);
    if (d.id === 'cfg') { R.cfg = v.cfg; R.cli = v.cli || {}; continue; }
    const list2 = R[d.id.split('-')[0]];
    if (Array.isArray(list2) && Array.isArray(v)) list2.push(...v);
  }
  return { R, sent };
}

/** Nombre legible de un documento («fac-2026-1» → «Facturas de 2026»). */
export function shardLabel(key) {
  const [kind, a, b] = String(key).split('-');
  const names = { fac: 'Facturas', mov: 'Caja', srv: 'Servicios', gas: 'Gasolina', huc: 'Hucha', jor: 'Jornadas', prv: 'Proveedores', cfg: 'Ajustes' };
  const when = kind === 'fac' ? 'de ' + a : a && b ? 'de ' + b + '/' + a : '';
  return ((names[kind] || key) + ' ' + when).trim();
}

/**
 * Tipo de error al subir a Firestore, para avisar bien (no todo es «sin conexión»).
 * 'offline' | 'too-big' | 'denied' | 'quota' | 'auth' | 'unknown'
 */
export function classifyError(err, online = true) {
  const code = String((err && err.code) || '').replace(/^firestore\//, '');
  const msg = String((err && err.message) || '');
  if (!online || code === 'unavailable' || code === 'deadline-exceeded' || /network|offline|failed to fetch/i.test(msg)) return 'offline';
  if (code === 'invalid-argument' && /size|exceeds|too large|bytes/i.test(msg)) return 'too-big';
  if (code === 'permission-denied') return 'denied';
  if (code === 'resource-exhausted') return 'quota';
  if (code === 'unauthenticated') return 'auth';
  return 'unknown';
}
