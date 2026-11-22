import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseOf, cashStats, invoiceTotals, nextInvoiceNumber } from '../js/money.js';

test('baseOf separa el IVA de un importe con IVA incluido', () => {
  assert.equal(baseOf(110, 10), 100);
  assert.equal(baseOf(45.5, 10), 41.36);
  assert.equal(baseOf(50, 0), 50);
});

test('invoiceTotals suma por líneas y cuadra base + IVA = total', () => {
  const t = invoiceTotals({ iva: 10, items: [{ i: 45.5 }, { i: 30 }] });
  assert.deepEqual(t, { b: 68.63, v: 6.87, t: 75.5 });
  assert.equal(Math.round((t.b + t.v) * 100), Math.round(t.t * 100));
});

test('nextInvoiceNumber usa el mayor entre el último indicado y los emitidos', () => {
  assert.equal(nextInvoiceNumber(0, []), '001');
  assert.equal(nextInvoiceNumber(41, []), '042');
  assert.equal(nextInvoiceNumber(3, [{ num: '007' }, { num: '005' }]), '008');
});

test('nextInvoiceNumber sigue contando a partir de 999', () => {
  assert.equal(nextInvoiceNumber(0, [{ num: '999' }]), '1000');
  assert.equal(nextInvoiceNumber(0, [{ num: '1000' }]), '1001');
});

test('cashStats separa ingresos, gastos y neto por forma de pago', () => {
  const s = cashStats([
    { t: 'in', p: 'efectivo', i: 50 },
    { t: 'in', p: 'tarjeta', i: 30 },
    { t: 'out', p: 'efectivo', i: 20 },
  ]);
  assert.equal(s.in, 80);
  assert.equal(s.out, 20);
  assert.equal(s.netCash, 30);
  assert.equal(s.netCard, 30);
});
