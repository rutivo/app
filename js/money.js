// Cálculos de IVA, facturas, caja y hucha. Funciones puras.
import { r2, sum } from './utils.js';

/** Base imponible de un importe con IVA incluido. */
export const baseOf = (total, ivaPct) => r2(total / (1 + ivaPct / 100));

/** Totales de una factura: base, IVA y total. */
export function invoiceTotals(invoice) {
  const t = r2(sum(invoice.items, (x) => x.i));
  const b = r2(sum(invoice.items, (x) => baseOf(x.i, invoice.iva)));
  return { b, v: r2(t - b), t };
}

/**
 * Siguiente número de factura: uno más que el mayor entre el último indicado
 * por el usuario y los ya emitidos. Se rellena a 3 cifras ("007").
 */
export function nextInvoiceNumber(lastIssued, invoices) {
  const nums = invoices.map((f) => parseInt(String(f.num).replace(/\D/g, ''), 10) || 0);
  return String(Math.max(lastIssued, ...nums) + 1).padStart(3, '0');
}

/** Totales de una lista de movimientos de caja. */
export function cashStats(movements) {
  const total = (type, pay) => sum(movements.filter((m) => m.t === type && (!pay || m.p === pay)), (m) => m.i);
  return {
    in: total('in'),
    out: total('out'),
    inCash: total('in', 'efectivo'),
    inCard: total('in', 'tarjeta'),
    netCash: total('in', 'efectivo') - total('out', 'efectivo'),
    netCard: total('in', 'tarjeta') - total('out', 'tarjeta'),
  };
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * Periodo de la hucha que contiene el día `ref`. El periodo empieza el día
 * `startDay` (1-28) de cada mes. Devuelve inicio `a` (incluido), fin `b`
 * (excluido) y número de días `n`.
 */
export function savingsPeriod(ref, startDay) {
  const y = +ref.slice(0, 4);
  const m = +ref.slice(5, 7) - 1;
  const d = +ref.slice(8, 10);
  const D = Math.min(28, startDay || 1);
  const a = d >= D ? new Date(Date.UTC(y, m, D)) : new Date(Date.UTC(y, m - 1, D));
  const b = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, D));
  return { a: isoDay(a), b: isoDay(b), n: Math.round((b - a) / 864e5) };
}

/** Estado de la hucha para el día `day` con objetivo `goal`. */
export function savingsStatus(entries, day, goal, startDay) {
  const P = savingsPeriod(day, startDay);
  const list = entries.filter((x) => x.f >= P.a && x.f < P.b).sort((a, b) => b.f.localeCompare(a.f));
  const saved = r2(sum(list, (x) => x.i));
  const missing = Math.max(0, r2(goal - saved));
  const daysLeft = Math.max(1, Math.round((new Date(P.b) - new Date(day)) / 864e5));
  const daily = r2(goal / P.n);
  const daysPassed = Math.round((new Date(day) - new Date(P.a)) / 864e5) + 1;
  const expected = r2(daily * daysPassed);
  return {
    period: P,
    list,
    saved,
    missing,
    daysLeft,
    daily,
    perDayLeft: r2(missing / daysLeft),
    expected,
    onTrack: saved >= expected,
    pct: Math.min(100, Math.round((saved / goal) * 100)),
  };
}

/** Ahorro total por periodo (clave: día de inicio). */
export function savingsByPeriod(entries, startDay) {
  const groups = {};
  for (const x of entries) {
    const a = savingsPeriod(x.f, startDay).a;
    groups[a] = r2((groups[a] || 0) + x.i);
  }
  return groups;
}
