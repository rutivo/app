// Huchas: varias metas de ahorro, racha, calendario y meses. Funciones puras.
//   Huchas (en S.cfg.huchas): {id, n: nombre, e: emoji, m: meta €, fl?: fecha límite, a?: aporte diario €}
//   Movimientos (S.huc):      {id, f, i, h?: id de hucha, c?: motivo}  · i < 0 = dinero sacado
import { r2, sum } from './utils.js';

export const MAIN = 'main';
export const EMOJIS = ['🐷', '🏖️', '🛞', '🚕', '🏠', '🎁', '💍', '🎓', '🩺', '✈️', '🧾', '💶'];
const DAY = 864e5;
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d, n) => isoOf(dayMs(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);

/** Lista de huchas; si no hay ninguna, crea "Mi hucha" con la meta antigua. */
export function huchasOf(cfg) {
  if (Array.isArray(cfg.huchas) && cfg.huchas.length) return cfg.huchas;
  return [{ id: MAIN, n: 'Mi hucha', e: '🐷', m: cfg.hm || 500, a: 10 }];
}

/** Movimientos de una hucha (los antiguos, sin hucha, son de la principal). */
export const entriesOf = (entries, id) => entries.filter((x) => (x.h || MAIN) === id);

/** Estado de una hucha el día `day`. */
export function huchaStatus(h, entries, day) {
  const list = entriesOf(entries, h.id).sort((a, b) => b.f.localeCompare(a.f) || String(b.id).localeCompare(String(a.id)));
  const saved = r2(sum(list, (x) => x.i));
  const goal = Math.max(0, +h.m || 0);
  const missing = Math.max(0, r2(goal - saved));
  const pct = goal ? Math.min(100, Math.max(0, Math.round((saved / goal) * 100))) : 0;
  const done = goal > 0 && saved >= goal;
  let daysLeft = null;
  let perDay = +h.a || 10;
  if (h.fl && h.fl >= day) {
    daysLeft = daysBetween(day, h.fl) + 1;
    perDay = missing ? Math.max(0.5, Math.ceil((missing / daysLeft) * 2) / 2) : 0; // de 0,50 € en 0,50 €
  }
  // Fecha estimada al ritmo de los últimos 30 días
  const from = addDays(day, -29);
  const last30 = r2(sum(list.filter((x) => x.f >= from && x.f <= day), (x) => x.i));
  const pace = last30 > 0 ? last30 / 30 : 0;
  const eta = done || !pace ? null : addDays(day, Math.ceil(missing / pace));
  return { list, saved, goal, missing, pct, done, daysLeft, perDay: r2(perDay), eta, late: !!(h.fl && eta && eta > h.fl) };
}

/** Días seguidos metiendo dinero (en cualquier hucha) hasta hoy, o hasta ayer si hoy aún no. */
export function streak(entries, day) {
  const days = new Set(entries.filter((x) => x.i > 0).map((x) => x.f));
  let d = days.has(day) ? day : addDays(day, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Días del mes "AAAA-MM" en los que se metió dinero. */
export const depositDays = (entries, ym) => new Set(entries.filter((x) => x.i > 0 && x.f.startsWith(ym)).map((x) => x.f));

/** Neto ahorrado en cada uno de los últimos `n` meses hasta `day`: [{ym, total}], del más antiguo al actual. */
export function monthlyTotals(entries, day, n = 6) {
  const out = [];
  let y = +day.slice(0, 4);
  let m = +day.slice(5, 7);
  for (let i = 0; i < n; i++) {
    const ym = y + '-' + String(m).padStart(2, '0');
    out.unshift({ ym, total: r2(sum(entries.filter((x) => x.f.startsWith(ym)), (x) => x.i)) });
    m--;
    if (!m) { m = 12; y--; }
  }
  return out;
}

/** ¿Este movimiento hace llegar a la meta? (para celebrarlo una sola vez) */
export const reachesGoal = (before, after, goal) => goal > 0 && before < goal && after >= goal;
