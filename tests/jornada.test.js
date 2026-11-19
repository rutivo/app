import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareDay, dayStats, formatHours, hoursOf } from '../js/jornada.js';

const mov = (f, t, i) => ({ f, t, i, p: 'efectivo' });

test('horas trabajadas, también cruzando la medianoche', () => {
  assert.equal(hoursOf({ hi: '07:30', hf: '15:30' }), 8);
  assert.equal(hoursOf({ hi: '20:00', hf: '02:30' }), 6.5);
  assert.equal(hoursOf({ hi: '07:30' }), null);
  assert.equal(formatHours(8.0833), '8 h 05 min');
});

test('beneficio del día con todos los ingresos y gastos, por km y por hora', () => {
  const m = [mov('2026-11-19', 'in', 235), mov('2026-11-19', 'in', 60), mov('2026-11-19', 'out', 15), mov('2026-11-18', 'in', 999)];
  const s = dayStats(m, '2026-11-19', { ki: 20000, kf: 20140, hi: '07:30', hf: '15:30' });
  assert.deepEqual(s, { day: '2026-11-19', inc: 295, out: 15, ben: 280, km: 140, h: 8, perKm: 2, perH: 35, count: 2 });
});

test('sin km ni horas no hay €/km ni €/h', () => {
  const s = dayStats([mov('2026-11-19', 'in', 50)], '2026-11-19', undefined);
  assert.equal(s.perKm, null);
  assert.equal(s.perH, null);
});

test('comparación con la media, récord y objetivo', () => {
  const m = [];
  for (let d = 10; d <= 15; d++) m.push(mov('2026-11-' + d, 'in', 120), mov('2026-11-' + d, 'out', 20));
  m.push(mov('2026-11-19', 'in', 295), mov('2026-11-19', 'out', 15));
  const jor = [{ f: '2026-11-15', ki: 0, kf: 200 }, { f: '2026-11-19', ki: 0, kf: 140 }];
  const c = compareDay({ mov: m, jor }, '2026-11-19', 250);
  assert.equal(c.avgBen, 100);
  assert.equal(c.vsAvg, 180);
  assert.equal(c.avgPerKm, 0.5);
  assert.equal(c.kmVsAvg, 300);
  assert.equal(c.record, true);
  assert.equal(c.goalMet, true);
  assert.equal(c.pastDays, 6);
});

test('sin historial no hay récord ni comparación', () => {
  const c = compareDay({ mov: [mov('2026-11-19', 'in', 50)], jor: [] }, '2026-11-19');
  assert.equal(c.record, false);
  assert.equal(c.vsAvg, null);
});
