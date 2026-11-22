// Cálculos de IVA, facturas y caja. Funciones puras.
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
