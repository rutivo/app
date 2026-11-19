import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depositDays, huchaStatus, huchasOf, monthlyTotals, reachesGoal, streak } from '../js/huchas.js';

const e = (f, i, h, c) => ({ id: f + i, f, i, h, c });

test('sin huchas guardadas se crea "Mi hucha" con la meta antigua', () => {
  assert.deepEqual(huchasOf({ hm: 300 }).map((h) => [h.id, h.n, h.m]), [['main', 'Mi hucha', 300]]);
  assert.equal(huchasOf({ huchas: [{ id: 'x', n: 'Ruedas', e: '🛞', m: 400 }] })[0].n, 'Ruedas');
});

test('estado: ahorrado con lo sacado, porcentaje y lo que falta', () => {
  const list = [e('2026-11-01', 100), e('2026-11-10', 50, 'main'), e('2026-11-12', -30, 'main', 'IVA'), e('2026-11-12', 999, 'otra')];
  const s = huchaStatus({ id: 'main', m: 500, a: 10 }, list, '2026-11-19');
  assert.equal(s.saved, 120);
  assert.equal(s.missing, 380);
  assert.equal(s.pct, 24);
  assert.equal(s.perDay, 10);
  assert.equal(s.list.length, 3);
});

test('con fecha límite: cuánto meter al día para llegar', () => {
  const s = huchaStatus({ id: 'v', m: 1500, fl: '2026-12-31' }, [e('2026-11-01', 300, 'v')], '2026-11-19');
  assert.equal(s.daysLeft, 43);
  assert.equal(s.perDay, 28); // 1200 / 43 = 27,9 → 28
});

test('fecha estimada al ritmo de los últimos 30 días', () => {
  const list = Array.from({ length: 10 }, (_, k) => e('2026-11-' + String(10 + k).padStart(2, '0'), 30, 'v'));
  const s = huchaStatus({ id: 'v', m: 600 }, list, '2026-11-19');
  assert.equal(s.saved, 300);
  assert.equal(s.eta, '2026-12-19'); // 10 €/día de media → 30 días
});

test('racha de días seguidos', () => {
  const list = [e('2026-11-19', 5), e('2026-11-18', 5), e('2026-11-17', 5), e('2026-11-15', 5), e('2026-11-16', -20)];
  assert.equal(streak(list, '2026-11-19'), 3);
  assert.equal(streak(list, '2026-11-20'), 3); // hoy aún no ha metido: cuenta hasta ayer
  assert.equal(streak(list, '2026-11-22'), 0);
});

test('calendario y meses', () => {
  const list = [e('2026-11-03', 10), e('2026-11-03', 5), e('2026-11-05', -5), e('2026-10-30', 20), e('2026-06-01', 7)];
  assert.deepEqual([...depositDays(list, '2026-11')], ['2026-11-03']);
  assert.deepEqual(monthlyTotals(list, '2026-11-19', 3), [{ ym: '2026-09', total: 0 }, { ym: '2026-10', total: 20 }, { ym: '2026-11', total: 10 }]);
  assert.equal(monthlyTotals(list, '2026-02-01', 6)[0].ym, '2025-09');
});

test('celebrar al llegar a la meta solo una vez', () => {
  assert.equal(reachesGoal(490, 500, 500), true);
  assert.equal(reachesGoal(500, 510, 500), false);
});
