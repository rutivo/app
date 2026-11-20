// Informe del trimestre para el gestor. Funciones puras.
import { baseOf, cashStats, invoiceTotals } from './money.js';
import { fd, quarterOf, r2, sum, csvCell } from './utils.js';

const money = (n) => r2(n).toFixed(2).replace('.', ',');
const row = (cells) => cells.map(csvCell).join(';');

/** Datos del trimestre `q` ("2026-T4"). */
export function quarterData(state, q) {
  const movs = state.mov.filter((m) => quarterOf(m.f) === q).sort((a, b) => a.f.localeCompare(b.f));
  const c = cashStats(movs);
  const iva = state.cfg.iva || 0;
  const base = baseOf(c.in, iva);
  const gas = state.gas.filter((g) => quarterOf(g.f) === q);
  const invoices = state.fac.filter((f) => quarterOf(f.fecha) === q);
  return {
    q, movs, gas, invoices, iva,
    income: r2(c.in), base, vat: r2(c.in - base), expenses: r2(c.out),
    card: r2(c.inCard), cash: r2(c.inCash),
    fuel: r2(sum(gas, (g) => g.i)), fuelLiters: r2(sum(gas, (g) => g.l || 0)),
    invoiced: r2(sum(invoices, (f) => invoiceTotals(f).t)),
  };
}

/** CSV (separado por ";", abre bien en Excel en español). */
export function quarterCsv(state, q) {
  const d = quarterData(state, q);
  const label = 'T' + q.slice(-1) + ' ' + q.slice(0, 4);
  const lines = [
    row(['Resumen ' + label, state.cfg.nom || '', state.cfg.nif || '']),
    row(['Ingresos (con IVA)', money(d.income)]),
    row(['Base imponible', money(d.base)]),
    row(['IVA ' + d.iva + '%', money(d.vat)]),
    row(['Gastos', money(d.expenses)]),
    row(['Gasolina', money(d.fuel), r2(d.fuelLiters) + ' L']),
    row(['Facturas emitidas', money(d.invoiced)]),
    '',
    row(['Movimientos']),
    row(['Fecha', 'Tipo', 'Pago', 'Concepto', 'Importe']),
    ...d.movs.map((m) => row([fd(m.f), m.t === 'in' ? 'Ingreso' : 'Gasto', m.p, m.c, money(m.t === 'in' ? m.i : -m.i)])),
    '',
    row(['Facturas']),
    row(['Número', 'Fecha', 'Cliente', 'NIF cliente', 'Base', 'IVA', 'Total']),
    ...d.invoices.map((f) => { const t = invoiceTotals(f); return row([f.num, fd(f.fecha), f.cl.nom, f.cl.nif, money(t.b), money(t.v), money(t.t)]); }),
    '',
    row(['Gasolina']),
    row(['Fecha', 'Gasolinera', 'Litros', 'Pago', 'Importe']),
    ...d.gas.map((g) => row([fd(g.f), g.s || '', g.l || '', g.p, money(g.i)])),
  ];
  return '﻿' + lines.join('\r\n');
}
