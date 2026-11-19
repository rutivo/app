// Jornada diaria: km, horas y beneficio del día. Funciones puras.
import { kmOf } from './trips.js';
import { r2, sum } from './utils.js';

/** Horas trabajadas entre "HH:MM" y "HH:MM" (si termina de madrugada, cruza la medianoche). */
export function hoursOf(j) {
  if (!j || !j.hi || !j.hf) return null;
  const [a, b] = j.hi.split(':').map(Number);
  const [c, d] = j.hf.split(':').map(Number);
  let min = c * 60 + d - (a * 60 + b);
  if (min <= 0) min += 1440;
  return r2(min / 60);
}

/** "8 h 05 min". */
export const formatHours = (h) => {
  const m = Math.round(h * 60);
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
};

/** Resumen de un día: ingresos y gastos de TODA la caja, km y horas de la jornada. */
export function dayStats(movements, day, jornada) {
  const list = movements.filter((m) => m.f === day);
  const inc = r2(sum(list.filter((m) => m.t === 'in'), (m) => m.i));
  const out = r2(sum(list.filter((m) => m.t === 'out'), (m) => m.i));
  const ben = r2(inc - out);
  const km = jornada ? kmOf(jornada) : null;
  const h = hoursOf(jornada);
  return {
    day, inc, out, ben, km, h,
    perKm: km ? r2(ben / km) : null,
    perH: h ? r2(ben / h) : null,
    count: list.filter((m) => m.t === 'in').length,
  };
}

const addDays = (d, k) => {
  const x = new Date(d + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + k);
  return x.toISOString().slice(0, 10);
};
const avg = (a) => (a.length ? r2(a.reduce((s, x) => s + x, 0) / a.length) : null);

/**
 * Comparación del día con los 30 días anteriores (solo días con ingresos):
 * medias, récord y si se ha cumplido el objetivo.
 */
export function compareDay(state, day, goal = 0) {
  const jorOf = (d) => (state.jor || []).find((j) => j.f === d);
  const today = dayStats(state.mov, day, jorOf(day));
  const from = addDays(day, -30);
  const days = [...new Set(state.mov.map((m) => m.f))].filter((d) => d < day && d >= from);
  const past = days.map((d) => dayStats(state.mov, d, jorOf(d))).filter((x) => x.inc > 0);
  const avgBen = avg(past.map((x) => x.ben));
  const avgPerKm = avg(past.filter((x) => x.perKm !== null).map((x) => x.perKm));
  const best = past.length ? Math.max(...past.map((x) => x.ben)) : null;
  const pct = (v, ref) => (ref ? Math.round(((v - ref) / Math.abs(ref)) * 100) : null);
  return {
    today,
    pastDays: past.length,
    avgBen,
    avgPerKm,
    vsAvg: today.inc > 0 ? pct(today.ben, avgBen) : null,
    kmVsAvg: today.perKm !== null ? pct(today.perKm, avgPerKm) : null,
    record: best !== null && past.length >= 3 && today.ben > best && today.ben > 0,
    goalMet: !!goal && today.ben >= goal,
  };
}
