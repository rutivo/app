// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel de estadísticas de la Caja (funciones puras, sin pantalla).
//
// Fuente única: los movimientos de la caja (S.mov) de la cuenta abierta. La
// gasolina ya está ahí (cada ticket de Gasolina crea su gasto en la caja con
// `mid`), así que NO se suma S.gas: se usaría dos veces. S.gas solo sirve para
// enlazar la foto del ticket.
//
// Fechas como texto «AAAA-MM-DD» (la fecha del apunte, sin horas): sin líos de
// zonas horarias ni cambios de hora. Semanas de lunes a domingo.
import { r2 } from './utils.js';

export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ---------- fechas ----------
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const at = (day) => new Date(day + 'T12:00:00');
export const addDays = (day, n) => { const d = at(day); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((at(b) - at(a)) / 864e5);
/** Lunes = 0 … domingo = 6 */
export const weekdayOf = (day) => (at(day).getDay() + 6) % 7;
const lastOfMonth = (y, m) => iso(new Date(y, m + 1, 0, 12)); // m: 0-11
const short = (day) => +day.slice(8, 10) + ' ' + MONTHS_SHORT[+day.slice(5, 7) - 1];

// ---------- movimientos válidos ----------
/** Solo apuntes bien formados (fecha, tipo e importe), con el importe como número. */
export function cleanMovements(mov) {
  const out = [];
  for (const m of mov || []) {
    if (!m || !DAY_RE.test(String(m.f)) || (m.t !== 'in' && m.t !== 'out')) continue;
    const i = Number(m.i);
    if (!Number.isFinite(i) || i < 0) continue;
    out.push(i === m.i ? m : { ...m, i });
  }
  return out;
}

/** Ingresos, gastos y limpio de los apuntes entre `from` y `to` (incluidos). */
export function totalsIn(mov, from, to) {
  let inc = 0;
  let out = 0;
  let n = 0;
  for (const m of mov) {
    if (m.f < from || m.f > to) continue;
    if (m.t === 'in') { inc += m.i; n++; } else out += m.i;
  }
  return { inc: r2(inc), out: r2(out), net: r2(inc - out), count: n };
}

// ---------- periodos ----------
/**
 * Los últimos `n` periodos (semanas, meses o años) hasta el actual, el actual
 * el último. Cada uno: {key, from, to, label, long, partial}. `partial`: aún no
 * ha terminado (acaba hoy o después); su resumen llega hasta hoy.
 */
export function periods(unit, today, n) {
  const out = [];
  if (unit === 'sem') {
    const monday = addDays(today, -weekdayOf(today));
    for (let k = n - 1; k >= 0; k--) {
      const from = addDays(monday, -7 * k);
      const to = addDays(from, 6);
      const sameMonth = from.slice(5, 7) === to.slice(5, 7);
      out.push({ key: from, from, to, label: short(from), long: 'Semana del ' + (sameMonth ? +from.slice(8, 10) : short(from)) + ' al ' + short(to) + (from.slice(0, 4) !== today.slice(0, 4) || to.slice(0, 4) !== from.slice(0, 4) ? ' de ' + to.slice(0, 4) : '') });
    }
  } else if (unit === 'mes') {
    const y = +today.slice(0, 4);
    const m = +today.slice(5, 7) - 1;
    for (let k = n - 1; k >= 0; k--) {
      const d = new Date(y, m - k, 1, 12);
      const yy = d.getFullYear();
      const mm = d.getMonth();
      const from = iso(d);
      out.push({ key: from.slice(0, 7), from, to: lastOfMonth(yy, mm), label: MONTHS_SHORT[mm], long: MONTHS_LONG[mm].charAt(0).toUpperCase() + MONTHS_LONG[mm].slice(1) + ' ' + yy, year: yy });
    }
  } else {
    const y = +today.slice(0, 4);
    for (let k = n - 1; k >= 0; k--) out.push({ key: String(y - k), from: (y - k) + '-01-01', to: (y - k) + '-12-31', label: String(y - k), long: 'Año ' + (y - k) });
  }
  for (const p of out) p.partial = p.to >= today; // el último día aún no ha terminado
  return out;
}

/** Cuántos periodos mostrar: 8 semanas, 12 meses y los años con datos (de 2 a 5). */
export function periodCount(unit, mov, today) {
  if (unit === 'sem') return 8;
  if (unit === 'mes') return 12;
  const first = mov.reduce((a, m) => (m.f < a ? m.f : a), today);
  return Math.min(5, Math.max(2, +today.slice(0, 4) - +first.slice(0, 4) + 1));
}

/**
 * Evolución: ingresos, gastos y limpio de cada periodo, con la comparación con
 * el anterior. El periodo en curso se compara con el anterior HASTA EL MISMO
 * PUNTO (p. ej. del 1 al 19 de este mes con del 1 al 19 del mes pasado): una
 * semana a medias no se compara con una semana completa.
 */
export function evolution(movRaw, unit, today, n = periodCount(unit, cleanMovements(movRaw), today)) {
  const mov = cleanMovements(movRaw);
  const ps = periods(unit, today, n + 1); // uno más para comparar el primero
  const rows = [];
  for (let i = 1; i < ps.length; i++) {
    const p = ps[i];
    const prev = ps[i - 1];
    const to = p.partial ? today : p.to;
    const cur = totalsIn(mov, p.from, to);
    // Mismo tramo del anterior: tantos días desde su inicio como llevamos en este
    const prevTo = p.partial ? minDay(prev.to, addDays(prev.from, daysBetween(p.from, today))) : prev.to;
    const before = totalsIn(mov, prev.from, prevTo);
    rows.push({ ...p, ...cur, upTo: to, prev: { ...before, from: prev.from, to: prevTo, long: prev.long }, change: pct(cur.net, before.net) });
  }
  return rows;
}
const minDay = (a, b) => (a < b ? a : b);
/** Variación en %: null si antes era 0 (no hay con qué comparar). */
export function pct(now, before) {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

// ---------- gastos por categoría ----------
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const CATEGORIES = [
  { id: 'gasolina', name: 'Gasolina', re: /gasolin|gasoil|gasoleo|diesel|combustible|repost|carburante|\bgas\b/ },
  { id: 'peajes', name: 'Peajes', re: /peaje|autopista|\bap-?7\b|\bvia-?t\b/ },
  { id: 'mantenimiento', name: 'Mantenimiento', re: /taller|mecanic|revision|aceite|neumatic|rueda|freno|bateria|pinchazo|chapa|pintura|embrague|filtro|\bitv\b|recambio|pieza|averia|reparac|mantenim|taximetro|correa|amortiguador|luna|parabrisas/ },
  { id: 'seguros', name: 'Seguros', re: /seguro|poliza|mutua/ },
  { id: 'gestoria', name: 'Gestoría', re: /gestor|asesor|contabl/ },
  { id: 'lavados', name: 'Lavados', re: /lavad|lavar|lavacoches|lavadero|aspirad|limpieza/ },
  { id: 'otros', name: 'Otros gastos', re: null },
];
/** Categoría de un gasto por su concepto. */
export function categoryOf(concept) {
  const t = norm(concept);
  return (CATEGORIES.find((c) => c.re && c.re.test(t)) || CATEGORIES[CATEGORIES.length - 1]).id;
}

/**
 * Gastos del periodo por categoría, con importe, % del total y sus apuntes
 * (los más recientes primero). Solo las categorías con gastos; «Otros» al final.
 */
export function expenseBreakdown(movRaw, from, to) {
  const mov = cleanMovements(movRaw).filter((m) => m.t === 'out' && m.f >= from && m.f <= to);
  const total = r2(mov.reduce((a, m) => a + m.i, 0));
  const cats = CATEGORIES.map((c) => {
    const items = mov.filter((m) => categoryOf(m.c) === c.id).sort((a, b) => (a.f < b.f ? 1 : a.f > b.f ? -1 : 0));
    const sum = r2(items.reduce((a, m) => a + m.i, 0));
    return { id: c.id, name: c.name, total: sum, pct: total ? Math.round((sum / total) * 1000) / 10 : 0, items };
  }).filter((c) => c.items.length);
  const main = cats.filter((c) => c.id !== 'otros').sort((a, b) => b.total - a.total);
  return { total, count: mov.length, cats: [...main, ...cats.filter((c) => c.id === 'otros')] };
}

// ---------- días trabajados ----------
/**
 * Lo limpio de cada día trabajado. Día trabajado = día con algún ingreso
 * (un día con solo un gasto —el taller un domingo— no es un día trabajado,
 * pero su gasto sí cuenta en los totales y en la media por día trabajado).
 */
export function workedDays(mov, from, to) {
  const byDay = new Map();
  for (const m of mov) {
    if (m.f < from || m.f > to) continue;
    const d = byDay.get(m.f) || { inc: 0, out: 0 };
    if (m.t === 'in') d.inc += m.i; else d.out += m.i;
    byDay.set(m.f, d);
  }
  const out = new Map();
  for (const [day, d] of byDay) if (d.inc > 0) out.set(day, r2(d.inc - d.out));
  return out;
}

/** Qué días de la semana rinden más: media limpia de los días trabajados de los últimos `days` días. */
export function productivity(movRaw, today, days = 90) {
  const mov = cleanMovements(movRaw);
  const from = addDays(today, -(days - 1));
  const worked = workedDays(mov, from, today);
  const acc = WEEKDAYS.map((name) => ({ name, label: name.charAt(0), worked: 0, total: 0 }));
  for (const [day, net] of worked) { const w = acc[weekdayOf(day)]; w.worked++; w.total = r2(w.total + net); }
  const list = acc.map((w) => ({ ...w, avg: w.worked ? r2(w.total / w.worked) : 0 }));
  const withData = list.filter((w) => w.worked);
  const best = withData.length ? withData.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
  const worst = withData.length > 1 ? withData.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
  return { from, to: today, days, workedDays: worked.size, list, best, worst: worst && best && worst.name !== best.name ? worst : null };
}

// ---------- resumen (las cifras de arriba) ----------
/**
 * Cifras clave: este mes (y frente al mismo tramo del mes pasado), este año,
 * media limpia por día trabajado del año y mejor mes del año.
 */
export function summary(movRaw, today) {
  const mov = cleanMovements(movRaw);
  const y = today.slice(0, 4);
  const monthRows = evolution(mov, 'mes', today, 1);
  const month = monthRows[0];
  const year = totalsIn(mov, y + '-01-01', today);
  const days = workedDays(mov, y + '-01-01', today).size;
  const months = periods('mes', today, +today.slice(5, 7)).map((p) => ({ ...p, ...totalsIn(mov, p.from, p.partial ? today : p.to) }));
  const withData = months.filter((m) => m.count || m.out);
  const best = withData.length ? withData.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  return {
    month: { net: month.net, inc: month.inc, out: month.out, change: month.change, long: month.long },
    year: { ...year, label: y },
    perDay: days ? r2(year.net / days) : null,
    workedDays: days,
    bestMonth: best ? { long: best.long, net: best.net, partial: best.partial } : null,
  };
}
