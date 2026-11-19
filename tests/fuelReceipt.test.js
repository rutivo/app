import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFuelReceipt } from '../js/fuelReceipt.js';

test('ticket típico de Repsol', () => {
  const t = `REPSOL
E.S. AVDA ANDALUCIA
CIF B12345678
FECHA: 18/11/2026 10:42
SURTIDOR 3
DIESEL E+
LITROS 34,21 L
PRECIO 1,459 EUR/L
BASE IMPONIBLE 41,25
IVA 21% 8,66
TOTAL 49,91 EUR
TARJETA`;
  assert.deepEqual(parseFuelReceipt(t), { amount: 49.91, liters: 34.21, station: 'Repsol', date: '2026-11-18' });
});

test('ticket con importe y litros en otro formato', () => {
  const t = `Cepsa Estacion de Servicio
18-11-26
Gasoleo A   30.10 L
IMPORTE A PAGAR: 45,15 €`;
  assert.deepEqual(parseFuelReceipt(t), { amount: 45.15, liters: 30.1, station: 'Cepsa', date: '2026-11-18' });
});

test('sin línea de total usa el mayor importe en euros', () => {
  const r = parseFuelReceipt('Gasolinera\n12,00 €\n55,30 €\n');
  assert.equal(r.amount, 55.3);
  assert.equal(r.station, '');
});

test('texto vacío no falla', () => {
  assert.deepEqual(parseFuelReceipt(''), { amount: null, liters: null, station: '', date: '' });
});
