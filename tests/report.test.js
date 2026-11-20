import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quarterCsv, quarterData } from '../js/report.js';

const state = {
  cfg: { nom: 'Antonio', nif: '123Z', iva: 10 },
  mov: [
    { f: '2026-10-05', t: 'in', p: 'tarjeta', i: 110, c: 'Carrera' },
    { f: '2026-11-02', t: 'out', p: 'efectivo', i: 20, c: 'Lavado; coche' },
    { f: '2026-07-01', t: 'in', p: 'efectivo', i: 999, c: 'Otro trimestre' },
  ],
  gas: [{ f: '2026-11-03', i: 50, l: 33.5, p: 'tarjeta', s: 'Repsol' }],
  fac: [{ num: '017', fecha: '2026-11-10', iva: 10, cl: { nom: 'Charly', nif: 'B9' }, items: [{ i: 235 }] }],
};

test('datos del trimestre', () => {
  const d = quarterData(state, '2026-T4');
  assert.equal(d.income, 110);
  assert.equal(d.base, 100);
  assert.equal(d.vat, 10);
  assert.equal(d.expenses, 20);
  assert.equal(d.fuel, 50);
  assert.equal(d.invoiced, 235);
  assert.equal(d.movs.length, 2);
});

test('CSV para Excel en español', () => {
  const csv = quarterCsv(state, '2026-T4');
  assert.ok(csv.startsWith('﻿Resumen T4 2026;Antonio;123Z'));
  assert.match(csv, /Base imponible;100,00/);
  assert.match(csv, /02\/11\/2026;Gasto;efectivo;"Lavado; coche";-20,00/);
  assert.match(csv, /017;10\/11\/2026;Charly;B9;213,64;21,36;235,00/);
  assert.doesNotMatch(csv, /Otro trimestre/);
});

import { csvCell } from '../js/utils.js';
test('CSV sin fórmulas que Excel ejecute', () => {
  assert.equal(csvCell('=HYPERLINK("http://malo")'), '"\'=HYPERLINK(""http://malo"")"');
  assert.equal(csvCell('+34 600'), "'+34 600");
  assert.equal(csvCell('-50,00'), '-50,00');
  assert.equal(csvCell('Agencia Sol'), 'Agencia Sol');
});
