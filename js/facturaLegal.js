// Requisitos legales de las facturas (Reglamento de facturación, RD 1619/2012)
// y preparación para el Reglamento de sistemas de facturación (RD 1007/2023,
// «Verifactu»): numeración correlativa, facturas que no se pueden borrar ni
// cambiar una vez emitidas, rectificativas para anular y huella encadenada.
// Funciones puras (salvo `fingerprint`, que usa WebCrypto).

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** NIF/NIE/CIF español válido (con su letra o dígito de control). */
export function validNif(raw) {
  const n = String(raw || '').toUpperCase().replace(/[\s.-]/g, '');
  if (/^\d{8}[A-Z]$/.test(n)) return DNI_LETTERS[+n.slice(0, 8) % 23] === n[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) return DNI_LETTERS[+('XYZ'.indexOf(n[0]) + n.slice(1, 8)) % 23] === n[8];
  if (/^[KLM]\d{7}[A-Z]$/.test(n)) return DNI_LETTERS[+n.slice(1, 8) % 23] === n[8];
  const m = n.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!m) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = +m[2][i];
    if (i % 2 === 0) { const x = d * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += d;
  }
  const digit = (10 - (sum % 10)) % 10;
  const letter = 'JABCDEFGHI'[digit];
  if ('PQRSNW'.includes(m[1])) return m[3] === letter;
  if ('ABEH'.includes(m[1])) return m[3] === String(digit);
  return m[3] === letter || m[3] === String(digit);
}

/** Lo que falta en tus datos para poder emitir una factura completa (lista vacía = todo bien). */
export function issuerProblems(cfg = {}) {
  const out = [];
  if (!String(cfg.nom || '').trim()) out.push('tu nombre o razón social');
  if (!validNif(cfg.nif)) out.push(String(cfg.nif || '').trim() ? 'un NIF válido (revisa la letra)' : 'tu NIF');
  if (!String(cfg.dir || '').trim()) out.push('tu dirección');
  if (!String(cfg.cp || '').trim() && !String(cfg.loc || '').trim()) out.push('tu código postal o localidad');
  if (!(cfg.iva > 0) && !String(cfg.ivaMot || '').trim()) out.push('el motivo de que no lleve IVA (p. ej. «exenta, art. 20 LIVA»)');
  return out;
}

/**
 * Lo que falta del cliente. Si es una empresa o autónomo (lo normal con
 * agencias), el NIF y la dirección son obligatorios. Un particular, solo el nombre.
 */
export function clientProblems(cl = {}) {
  const out = [];
  if (!String(cl.nom || '').trim()) out.push('el nombre del cliente');
  if (cl.part) return out;
  if (!validNif(cl.nif)) out.push(String(cl.nif || '').trim() ? 'un NIF válido del cliente (revisa la letra)' : 'el NIF del cliente');
  if (!String(cl.dir || '').trim()) out.push('la dirección del cliente');
  return out;
}

/** Siguiente número de rectificativa: serie propia «R-001», «R-002»… */
export function nextRectNumber(invoices) {
  const nums = invoices.filter((f) => f.tipo && f.tipo !== 'F1').map((f) => parseInt(String(f.num).replace(/\D/g, ''), 10) || 0);
  return 'R-' + String(Math.max(0, ...nums) + 1).padStart(3, '0');
}

/** "2026-11-20" → "20-11-2026" (formato de Hacienda). */
const aeatDate = (d) => d.split('-').reverse().join('-');

/** Fecha y hora con huso: "2026-11-20T19:20:30+01:00". */
export function isoWithZone(ms = Date.now()) {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    (off >= 0 ? '+' : '-') + pad(off / 60) + ':' + pad(off % 60);
}

/**
 * Cadena del registro de la factura según las especificaciones de la AEAT
 * para la huella (registro de alta), encadenada con la huella anterior.
 */
export function recordString(inv, totals, prevHash, generatedAt) {
  return 'IDEmisorFactura=' + String(inv.em.nif || '').toUpperCase().trim() +
    '&NumSerieFactura=' + String(inv.num).trim() +
    '&FechaExpedicionFactura=' + aeatDate(inv.fecha) +
    '&TipoFactura=' + (inv.tipo || 'F1') +
    '&CuotaTotal=' + Number(totals.v).toFixed(2) +
    '&ImporteTotal=' + Number(totals.t).toFixed(2) +
    '&Huella=' + (prevHash || '') +
    '&FechaHoraHusoGenRegistro=' + generatedAt;
}

/** SHA-256 en hexadecimal en mayúsculas. */
export async function fingerprint(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Facturas de la cadena en el orden en que se emitieron (por fecha y hora de
 * generación). No vale el orden de la lista: al bajar de la nube llegan
 * ordenadas por su identificador interno.
 */
export function chainOrder(invoices) {
  const t = (f) => Date.parse(f.gen) || 0;
  return invoices.filter((f) => f.huella).map((f, i) => ({ f, i })).sort((a, b) => t(a.f) - t(b.f) || a.i - b.i).map((x) => x.f);
}

/** Última huella de la cadena (la de la factura emitida más reciente que la tenga). */
export function lastHash(invoices) {
  const chain = chainOrder(invoices);
  return chain.length ? chain[chain.length - 1].huella : '';
}

/** Serie de una factura: «F» (ordinarias) o «R» (rectificativas). */
const series = (f) => (!f.tipo || f.tipo === 'F1' ? 'F' : 'R');

/**
 * Números repetidos dentro de la misma serie (p. ej. dos móviles sin conexión
 * emitiendo a la vez). Devuelve [{num, serie, ids:[…]}], de la más antigua a la más nueva.
 * Si todas menos una ya están anuladas (con su rectificativa), está resuelto y no se cuenta.
 */
export function duplicateNumbers(invoices) {
  const groups = new Map();
  for (const f of invoices) {
    const key = series(f) + '|' + String(f.num).trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const t = (f) => Date.parse(f.gen) || 0;
  return [...groups.values()].filter((g) => g.filter((f) => !f.anulada).length > 1).map((g) => {
    const sorted = [...g].sort((a, b) => t(a) - t(b));
    return { num: String(g[0].num).trim(), serie: series(g[0]), ids: sorted.map((f) => f.id) };
  });
}

/**
 * Comprueba que nadie ha cambiado las facturas: recalcula cada huella y
 * mira que la cadena esté entera. Devuelve los números de las que no cuadran.
 */
export async function verifyChain(invoices, totalsOf) {
  const bad = [];
  let prev = '';
  for (const f of chainOrder(invoices)) {
    const h = await fingerprint(recordString(f, totalsOf(f), prev, f.gen));
    if (h !== f.huella || (f.prev || '') !== prev) bad.push(f.num);
    prev = f.huella;
  }
  return bad;
}
