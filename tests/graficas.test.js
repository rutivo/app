// Estadísticas de la Caja: cada cifra sale de los apuntes reales y cuadra con ellos.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryOf, cleanMovements, evolution, expenseBreakdown, periods, productivity, summary, totalsIn, workedDays } from '../js/graficas.js';

const TODAY = '2026-11-19'; // jueves
const mov = [
  { id: 'a', f: '2026-11-19', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' },
  { id: 'b', f: '2026-11-19', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina: Repsol' },
  { id: 'c', f: '2026-11-16', t: 'in', p: 'tarjeta', i: 80, c: 'Carrera' }, // lunes de esta semana
  { id: 'd', f: '2026-11-15', t: 'in', p: 'efectivo', i: 60, c: 'Carrera' }, // domingo: semana anterior
  { id: 'e', f: '2026-11-14', t: 'out', p: 'efectivo', i: 100, c: 'Taller' }, // sábado, sin ingresos: no es día trabajado
  { id: 'f', f: '2026-11-10', t: 'in', p: 'efectivo', i: 40, c: 'Carrera' }, // martes de la semana anterior
  { id: 'g', f: '2026-11-03', t: 'out', p: 'efectivo', i: 6, c: 'peaje AP-7' },
  { id: 'h', f: '2026-10-10', t: 'in', p: 'tarjeta', i: 300, c: 'Transfer' },
  { id: 'i', f: '2026-10-12', t: 'out', p: 'tarjeta', i: 450, c: 'Seguro del taxi' },
  { id: 'j', f: '2026-09-02', t: 'out', p: 'tarjeta', i: 20, c: 'Lavado' },
  { id: 'k', f: '2026-01-02', t: 'in', p: 'efectivo', i: 90, c: 'Carrera' },
  { id: 'l', f: '2025-12-30', t: 'in', p: 'efectivo', i: 70, c: 'Carrera' },
  { id: 'm', f: '2025-11-05', t: 'out', p: 'tarjeta', i: 35, c: 'Gestoría' },
  // Mal formados: no deben contar (ni romper nada)
  { id: 'x1', f: '2026-11-19', t: 'in', p: 'efectivo', i: 'abc', c: 'roto' },
  { id: 'x2', f: '19/11/2026', t: 'in', p: 'efectivo', i: 999, c: 'fecha mala' },
  { id: 'x3', f: '2026-11-18', t: 'raro', p: 'efectivo', i: 999, c: 'tipo malo' },
  { id: 'x4', f: '2026-11-18', t: 'in', p: 'efectivo', i: '25', c: 'importe en texto' }, // vale: 25
];

test('solo cuentan los apuntes bien formados (un importe en texto se lee como número)', () => {
  const c = cleanMovements(mov);
  assert.equal(c.length, 14);
  assert.equal(c.find((m) => m.id === 'x4').i, 25);
});

test('semanas: de lunes a domingo; la actual «en curso» se compara con el MISMO tramo de la anterior', () => {
  const w = evolution(mov, 'sem', TODAY, 8);
  assert.equal(w.length, 8);
  const now = w[7];
  // 16-19 nov: 80 + 25 + 120 − 50
  assert.deepEqual([now.from, now.to, now.partial, now.upTo, now.inc, now.out, now.net], ['2026-11-16', '2026-11-22', true, '2026-11-19', 225, 50, 175]);
  // Mismo tramo (lunes a jueves) de la semana anterior: 9-12 nov → solo el 40 del martes (no el sábado ni el domingo)
  assert.deepEqual([now.prev.from, now.prev.to, now.prev.net], ['2026-11-09', '2026-11-12', 40]);
  assert.equal(now.change, Math.round(((175 - 40) / 40) * 100));
  // La anterior está completa y se compara con la semana completa de antes
  const prev = w[6];
  assert.deepEqual([prev.partial, prev.net, prev.prev.from, prev.prev.to, prev.prev.net], [false, 0, '2026-11-02', '2026-11-08', -6]); // 40 + 60 − 100
  assert.equal(prev.long, 'Semana del 9 al 15 nov');
});

test('meses y años: totales que cuadran con los apuntes, y el cambio de año', () => {
  const m = evolution(mov, 'mes', TODAY, 12);
  assert.equal(m.length, 12);
  assert.deepEqual(m.map((x) => x.key).slice(-3), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual([m[11].inc, m[11].out, m[11].net, m[11].partial], [325, 156, 169, true]); // 120+80+60+40+25 − (50+100+6)
  assert.deepEqual([m[10].inc, m[10].out, m[10].net, m[10].partial], [300, 450, -150, false]);
  // Noviembre en curso (1-19) frente a 1-19 de octubre: 300 − 450 (el 10 y el 12)
  assert.deepEqual([m[11].prev.from, m[11].prev.to, m[11].prev.net], ['2026-10-01', '2026-10-19', -150]);
  // La suma de los 12 meses = todos los apuntes de esos 12 meses (no se duplica ni se pierde nada)
  const sumNet = Math.round(m.reduce((a, x) => a + x.net, 0) * 100) / 100;
  assert.equal(sumNet, totalsIn(cleanMovements(mov), m[0].from, TODAY).net);
  // Semana que cruza el año: 29 dic 2025 – 4 ene 2026
  const p = periods('sem', '2026-01-02', 1)[0];
  assert.deepEqual([p.from, p.to], ['2025-12-29', '2026-01-04']);
  assert.equal(evolution(mov, 'sem', '2026-01-02', 1)[0].net, 160); // 70 (30 dic) + 90 (2 ene)
  const y = evolution(mov, 'ano', TODAY, 2);
  assert.deepEqual(y.map((x) => [x.key, x.net, x.partial]), [['2025', 35, false], ['2026', 89, true]]); // 2025: 70 − 35 · 2026: 715 − 626
  // 2026 en curso frente a 2025 hasta el 19 nov: −35
  assert.deepEqual([y[1].prev.to, y[1].prev.net], ['2025-11-19', -35]);
});

test('gastos por categoría: importes, % y que la suma coincide con el total', () => {
  assert.deepEqual(['Gasolina: Repsol', 'peaje AP-7', 'Taller', 'ITV', 'Seguro del taxi', 'Gestoría', 'Lavado', 'Café', ''].map(categoryOf),
    ['gasolina', 'peajes', 'mantenimiento', 'mantenimiento', 'seguros', 'gestoria', 'lavados', 'otros', 'otros']);
  const b = expenseBreakdown(mov, '2026-01-01', TODAY);
  assert.equal(b.total, 626); // 50 + 100 + 6 + 450 + 20
  assert.deepEqual(b.cats.map((c) => [c.id, c.total, c.pct]), [['seguros', 450, 71.9], ['mantenimiento', 100, 16], ['gasolina', 50, 8], ['lavados', 20, 3.2], ['peajes', 6, 1]]);
  assert.equal(b.cats.reduce((a, c) => a + c.total, 0), b.total);
  assert.equal(b.cats.reduce((a, c) => a + c.items.length, 0), b.count);
  assert.deepEqual(b.cats.find((c) => c.id === 'gasolina').items.map((x) => x.id), ['b']);
  // «Otros» siempre el último
  const o = expenseBreakdown([...mov, { id: 'z', f: '2026-11-18', t: 'out', p: 'efectivo', i: 900, c: 'Móvil' }], '2026-11-01', TODAY);
  assert.equal(o.cats.at(-1).id, 'otros');
});

test('días trabajados: solo los días con ingresos; mejor y peor día; periodo indicado', () => {
  const w = workedDays(cleanMovements(mov), '2026-11-01', TODAY);
  assert.deepEqual([...w.keys()].sort(), ['2026-11-10', '2026-11-15', '2026-11-16', '2026-11-18', '2026-11-19']);
  assert.equal(w.get('2026-11-19'), 70); // 120 − 50
  const p = productivity(mov, TODAY, 90);
  assert.deepEqual([p.from, p.to, p.days], ['2026-08-22', '2026-11-19', 90]);
  assert.equal(p.workedDays, 6); // + 10 oct
  assert.equal(p.list[5].name, 'Sábado');
  assert.deepEqual([p.list[5].worked, p.list[5].avg], [1, 300], 'el sábado 14/11 (solo taller) no cuenta; el 10/10 sí');
  assert.deepEqual([p.best.name, p.worst.name], ['Sábado', 'Miércoles']); // miércoles 18/11: 25
});

test('resumen: este mes frente al mismo tramo, el año, media por día trabajado y mejor mes', () => {
  const s = summary(mov, TODAY);
  assert.deepEqual([s.month.net, s.month.change], [169, Math.round(((169 + 150) / 150) * 100)]);
  assert.deepEqual([s.year.inc, s.year.out, s.year.net], [715, 626, 89]); // 325 + 300 + 90 / 156 + 450 + 20
  assert.equal(s.workedDays, 7);
  assert.equal(s.perDay, Math.round((89 / 7) * 100) / 100);
  assert.deepEqual([s.bestMonth.long, s.bestMonth.net], ['Noviembre 2026', 169]);
});
