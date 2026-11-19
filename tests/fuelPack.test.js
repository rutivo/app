import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuelBetween, packName, periodRange } from '../js/fuelPack.js';

test('periodos desde un día cualquiera', () => {
  assert.deepEqual(periodRange('mes', '2026-11-19'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(periodRange('mesAnt', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(periodRange('mesAnt', '2024-03-05'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(periodRange('tri', '2026-11-19'), { from: '2026-10-01', to: '2026-12-31' });
  assert.deepEqual(periodRange('triAnt', '2026-11-19'), { from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(periodRange('triAnt', '2026-02-01'), { from: '2025-10-01', to: '2025-12-31' });
  assert.deepEqual(periodRange('anio', '2026-05-05'), { from: '2026-01-01', to: '2026-12-31' });
});

test('facturas del periodo ordenadas y con totales', () => {
  const gas = [
    { id: 'a', f: '2026-11-12', i: 55, l: 34.2, ph: 1 },
    { id: 'b', f: '2026-10-02', i: 48.5, l: 30.1 },
    { id: 'c', f: '2026-09-30', i: 60, l: 40, ph: 1 },
  ];
  const p = fuelBetween(gas, '2026-10-01', '2026-12-31');
  assert.deepEqual(p.list.map((g) => g.id), ['b', 'a']);
  assert.equal(p.total, 103.5);
  assert.equal(p.liters, 64.3);
  assert.equal(p.withPhoto, 1);
});

test('nombre del archivo', () => {
  assert.equal(packName('tri', '2026-11-19', '2026-10-01', '2026-12-31'), 'Gasolina-2026-T4.pdf');
  assert.equal(packName('mesAnt', '2026-11-19', '2026-10-01', '2026-10-31'), 'Gasolina-2026-10.pdf');
  assert.equal(packName('fechas', '2026-11-19', '2026-10-05', '2026-11-02'), 'Gasolina-2026-10-05_2026-11-02.pdf');
});
