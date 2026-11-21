// Gráficas de la Caja: los números que se dibujan salen bien de tus apuntes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expenseCategories, monthly, weekdays, weekly } from '../js/graficas.js';

const TODAY = '2026-11-19'; // jueves
const mov = [
  { f: '2026-11-19', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' },
  { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina: Repsol' },
  { f: '2026-11-16', t: 'in', p: 'tarjeta', i: 80, c: 'Carrera' }, // lunes de esta semana
  { f: '2026-11-15', t: 'in', p: 'efectivo', i: 60, c: 'Carrera' }, // domingo: semana anterior
  { f: '2026-11-14', t: 'out', p: 'efectivo', i: 100, c: 'Taller' }, // sábado: semana anterior
  { f: '2026-11-03', t: 'out', p: 'efectivo', i: 6, c: 'peaje' },
  { f: '2026-10-10', t: 'in', p: 'tarjeta', i: 300, c: 'Transfer' },
  { f: '2026-09-02', t: 'out', p: 'tarjeta', i: 20, c: 'Lavado' },
];

test('por semanas: de lunes a domingo, la actual la última y marcada como en curso', () => {
  const w = weekly(mov, TODAY, 8);
  assert.equal(w.length, 8);
  const now = w[7];
  assert.deepEqual([now.key, now.inc, now.out, now.net, now.partial], ['2026-11-16', 200, 50, 150, true]);
  const prev = w[6];
  assert.deepEqual([prev.key, prev.net, prev.partial], ['2026-11-09', -40, false], 'semana con más gastos que ingresos: negativo');
  assert.equal(now.label, '16 nov');
  assert.equal(now.long, 'Semana del 16 nov');
});

test('por meses: los últimos 6, el actual el último', () => {
  const m = monthly(mov, TODAY, 6);
  assert.deepEqual(m.map((x) => x.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual([m[5].inc, m[5].out, m[5].net], [260, 156, 104]);
  assert.equal(m[4].net, 300);
  assert.equal(m[3].net, -20);
  assert.equal(m[5].long, 'Nov 2026');
  // Cambio de año
  assert.equal(monthly(mov, '2026-02-10', 3)[0].key, '2025-12');
});

test('en qué gastas más: por concepto (sin «: gasolinera»), el mayor primero y el resto en «Otros»', () => {
  const c = expenseCategories(mov, '2026-11-01', TODAY, 5);
  assert.deepEqual(c.items, [{ name: 'Taller', total: 100 }, { name: 'Gasolina', total: 50 }, { name: 'Peaje', total: 6 }]);
  assert.equal(c.total, 156);
  const many = Array.from({ length: 8 }, (_, i) => ({ f: '2026-11-05', t: 'out', p: 'efectivo', i: 10 + i, c: 'Cosa ' + i }));
  const t = expenseCategories(many, '2026-11-01', TODAY, 5);
  assert.equal(t.items.length, 6);
  assert.deepEqual(t.items[5], { name: 'Otros', total: 10 + 11 + 12 });
});

test('qué días rindes más: media de lo limpio en los días trabajados', () => {
  const w = weekdays(mov, TODAY, 90);
  assert.equal(w.length, 7);
  assert.deepEqual([w[3].name, w[3].worked, w[3].avg], ['Jueves', 1, 70]); // 19/11: 120 - 50
  assert.deepEqual([w[5].name, w[5].worked, w[5].avg], ['Sábado', 2, 100], 'sábados: 14/11 (−100) y 10/10 (+300)');
  assert.deepEqual([w[2].name, w[2].avg], ['Miércoles', -20]); // 02/09, dentro de los 90 días
  assert.equal(w[4].worked, 0, 'los viernes no se trabajó: media 0, no cuenta');
});
