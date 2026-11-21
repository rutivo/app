// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Datos de las gráficas de la Caja (funciones puras): lo limpio por semana y por
// mes, en qué se va el dinero y qué días de la semana rinden más.
import { r2, sum } from './utils.js';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const at = (day) => new Date(day + 'T12:00:00');
const addDays = (day, n) => { const d = at(day); d.setDate(d.getDate() + n); return iso(d); };
/** Lunes = 0 … domingo = 6 */
const weekday = (day) => (at(day).getDay() + 6) % 7;
const shortDay = (day) => +day.slice(8, 10) + ' ' + MONTHS_SHORT[+day.slice(5, 7) - 1];

function totals(list) {
  const inc = r2(sum(list.filter((m) => m.t === 'in'), (m) => m.i));
  const out = r2(sum(list.filter((m) => m.t === 'out'), (m) => m.i));
  return { inc, out, net: r2(inc - out) };
}

/** Las últimas `n` semanas (de lunes a domingo), la actual la última. */
export function weekly(mov, today, n = 8) {
  const monday = addDays(today, -weekday(today));
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const from = addDays(monday, -7 * k);
    const to = addDays(from, 6);
    out.push({ key: from, label: shortDay(from), long: 'Semana del ' + shortDay(from), ...totals(mov.filter((m) => m.f >= from && m.f <= to)), partial: k === 0 });
  }
  return out;
}

/** Los últimos `n` meses, el actual el último. */
export function monthly(mov, today, n = 6) {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(y, m - k, 1, 12);
    const key = iso(d).slice(0, 7);
    const name = MONTHS_SHORT[d.getMonth()];
    out.push({ key, label: name, long: name.charAt(0).toUpperCase() + name.slice(1) + ' ' + d.getFullYear(), ...totals(mov.filter((x) => x.f.startsWith(key))), partial: k === 0 });
  }
  return out;
}

/** En qué se va el dinero: gastos del periodo por concepto (el más grande primero), el resto junto en «Otros». */
export function expenseCategories(mov, from, to, top = 5) {
  const by = new Map();
  for (const x of mov) {
    if (x.t !== 'out' || x.f < from || x.f > to) continue;
    const raw = String(x.c || 'Otros').split(':')[0].trim() || 'Otros';
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    by.set(name, r2((by.get(name) || 0) + x.i));
  }
  const all = [...by].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  const total = r2(sum(all, (x) => x.total));
  if (all.length <= top) return { items: all, total };
  const rest = r2(sum(all.slice(top), (x) => x.total));
  return { items: [...all.slice(0, top), { name: 'Otros', total: rest }], total };
}

/**
 * Qué días de la semana rinden más: media de lo limpio en los días trabajados
 * (días con algún apunte) de los últimos `days` días.
 */
export function weekdays(mov, today, days = 90) {
  const from = addDays(today, -(days - 1));
  const byDay = new Map();
  for (const x of mov) {
    if (x.f < from || x.f > today) continue;
    byDay.set(x.f, r2((byDay.get(x.f) || 0) + (x.t === 'in' ? x.i : -x.i)));
  }
  const acc = WEEKDAYS.map((name) => ({ name, label: name.charAt(0), worked: 0, total: 0 }));
  for (const [day, net] of byDay) { const w = acc[weekday(day)]; w.worked++; w.total = r2(w.total + net); }
  return acc.map((w) => ({ ...w, avg: w.worked ? r2(w.total / w.worked) : 0 }));
}
