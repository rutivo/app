// Panel Transfer: el próximo servicio, hoy, mañana, la semana y lo que te deben.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { panelGroups } from '../js/panel.js';

process.env.TZ = 'Europe/Madrid';
const NOW = new Date('2026-11-22T10:00:00').getTime();
const S = (id, f, h, extra = {}) => ({ id, f, h, o: 'A', d: 'B', i: 50, p: 'efectivo', ...extra });
const list = [
  S('viejo', '2026-11-20', '09:00', { p: 'pendiente', i: 80 }),
  S('cobrado', '2026-11-21', '09:00'),
  S('ahora', '2026-11-22', '09:15'), // empezó hace 45 min: sigue «en curso»
  S('hoy', '2026-11-22', '18:00', { p: 'pendiente', i: 95 }),
  S('manana', '2026-11-23', '07:00'),
  S('semana', '2026-11-27', '12:00'),
  S('lejos', '2026-12-15', '12:00'),
];

test('el próximo es el que está en curso o el siguiente; luego hoy, mañana y la semana', () => {
  const g = panelGroups(list, NOW);
  assert.equal(g.next.id, 'ahora');
  assert.deepEqual(g.today.map((s) => s.id), ['hoy']);
  assert.deepEqual(g.tomorrow.map((s) => s.id), ['manana']);
  assert.deepEqual(g.week.map((s) => s.id), ['semana']);
  assert.equal(g.later, 1);
});

test('te deben: los pasados sin cobrar (los futuros pendientes no, aún no toca)', () => {
  const g = panelGroups(list, NOW);
  assert.deepEqual(g.debt.map((s) => s.id), ['viejo']);
  assert.equal(g.kpi.owed, 175); // por cobrar en total: 80 + 95
  assert.equal(g.kpi.todayCount, 2);
  assert.equal(g.kpi.todayMoney, 145);
  assert.equal(g.kpi.weekCount, 4);
});

test('sin servicios: nada que enseñar y todo a cero', () => {
  const g = panelGroups([], NOW);
  assert.equal(g.next, null);
  assert.deepEqual(g.kpi, { todayCount: 0, todayMoney: 0, owed: 0, weekCount: 0 });
});
