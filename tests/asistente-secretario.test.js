// Asistente de voz «secretario»: las frases del encargo, la forma de pago, los
// repartos, las correcciones, repetir una orden, quitar con confirmación y las
// consultas nuevas (efectivo, servicios, facturado, rentabilidad, último servicio).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ask, payParts } from '../js/asistente.js';

const NOW = new Date('2026-11-19T17:00:00'); // jueves
const state = {
  mov: [
    { f: '2026-11-19', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' },
    { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 45.5, c: 'Carrera' },
    { f: '2026-11-19', t: 'out', p: 'efectivo', i: 6, c: 'Lavado' },
    { f: '2026-11-18', t: 'in', p: 'efectivo', i: 80, c: 'Carrera' },
    { f: '2026-11-18', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina: Repsol' },
    { f: '2026-11-18', t: 'out', p: 'efectivo', i: 3.5, c: 'Café' },
    { f: '2026-11-16', t: 'in', p: 'tarjeta', i: 200, c: 'Transfer' },
  ],
  srv: [
    { id: 'a', f: '2026-11-10', h: '10:00', cl: 'Charly Transfers', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'pendiente' },
    { id: 'c', f: '2026-11-15', h: '09:00', cl: 'Viajes Costa S.L.', o: 'Aeropuerto', d: 'Mijas', i: 60, p: 'tarjeta' },
    { id: 'd', f: '2026-11-20', h: '08:30', cl: 'Viajes Costa S.L.', o: 'Hotel', d: 'Aeropuerto', i: 70, p: 'pendiente' },
  ],
  gas: [], huc: [],
  jor: [{ f: '2026-11-19', ki: 1000, kf: 1200, hi: '07:00', hf: '17:00' }],
  fac: [
    { id: 'f1', tipo: 'F1', num: '001', fecha: '2026-10-05', iva: 10, cl: { nom: 'Charly Transfers' }, items: [{ i: 110 }] },
    { id: 'f2', tipo: 'F1', num: '002', fecha: '2026-11-02', iva: 10, cl: { nom: 'Viajes Costa S.L.' }, items: [{ i: 55 }, { i: 55 }], anulada: 'R-001' },
    { id: 'r1', tipo: 'R4', num: 'R-001', fecha: '2026-11-03', iva: 10, cl: { nom: 'Viajes Costa S.L.' }, items: [{ i: -55 }, { i: -55 }] },
    { id: 'f3', tipo: 'F1', num: '003', fecha: '2026-11-04', iva: 10, cl: { nom: 'Viajes Costa S.L.' }, items: [{ i: 220 }] },
  ],
  cfg: { iva: 10 },
};
/** Conversación: cada frase con el hilo de la anterior. */
const talk = (...qs) => { let ctx = {}; const out = []; for (const q of qs) { const r = ask(q, state, NOW, {}, ctx); ctx = r.ctx; out.push(r); } return out; };
const it = (r) => r.action && (r.action.items || [r.action.item]).map((x) => [x.t, x.i, x.p, x.c]);

test('frases del encargo: apuntar', () => {
  assert.deepEqual(it(ask('Añade 35 euros en efectivo de un servicio', state, NOW)), [['in', 35, 'efectivo', 'Servicio']]);
  assert.deepEqual(it(ask('He cobrado 80 euros con tarjeta', state, NOW)), [['in', 80, 'tarjeta', 'Carrera']]);
  const [q, g] = talk('Apunta 25 euros de gasolina', 'con tarjeta');
  assert.match(q.text, /¿Lo has pagado en efectivo o con tarjeta\?/);
  assert.deepEqual(it(g), [['out', 25, 'tarjeta', 'Gasolina']]);
  assert.deepEqual(g.action.gas, { l: 0, s: '' }, 'la gasolina va también a la pantalla Gasolina');
  const [q2, e] = talk('Añade un gasto de 12 euros', 'en efectivo');
  assert.equal(q2.kind, 'answer');
  assert.deepEqual(it(e), [['out', 12, 'efectivo', 'Gasto']]);
  assert.equal(ask('apunta 40 euros de gasolina 30 litros con tarjeta', state, NOW).action.gas.l, 30);
});

test('pregunta solo lo que falta y lo dice como en el ejemplo', () => {
  const [a, b] = talk('Añade 50 euros de un servicio', 'En efectivo');
  assert.equal(a.kind, 'answer');
  assert.equal(a.speech, '¿Lo has cobrado en efectivo o con tarjeta?');
  assert.deepEqual(it(b), [['in', 50, 'efectivo', 'Servicio']]);
  assert.match(b.speech, /^Perfecto\. Apuntado: 50 euros en efectivo/);
  // Si ya lo dices todo, no pregunta nada
  assert.equal(ask('apunta 50 euros de un servicio con tarjeta', state, NOW).kind, 'action');
  // «No» a la pregunta: no se apunta nada
  const [, n] = talk('Añade 50 euros de un servicio', 'no, déjalo');
  assert.equal(n.kind, 'answer');
  assert.match(n.text, /no lo apunto/);
  // Una orden nueva sustituye a la que quedó a medias
  const [, x] = talk('Añade 50 euros de un servicio', 'apunta 7 euros de parking con tarjeta');
  assert.deepEqual(it(x), [['out', 7, 'tarjeta', 'Parking']]);
});

test('memoria: «He ganado 100 euros» → «La mitad en cada uno» → 50 y 50', () => {
  const [a, b] = talk('He ganado 100 euros', 'La mitad en cada uno');
  assert.match(a.speech, /efectivo o con tarjeta/);
  assert.deepEqual(it(b), [['in', 50, 'efectivo', 'Carrera'], ['in', 50, 'tarjeta', 'Carrera']]);
  const [, c] = talk('me han pagado 75', 'mitad y mitad');
  assert.deepEqual(it(c).map((x) => x[1]), [37.5, 37.5]);
  const [, d] = talk('He cobrado 100 euros', '60 en efectivo y el resto con tarjeta');
  assert.deepEqual(it(d), [['in', 60, 'efectivo', 'Carrera'], ['in', 40, 'tarjeta', 'Carrera']]);
  // De una vez
  assert.deepEqual(it(ask('he cobrado 100, 60 en efectivo y 40 con tarjeta', state, NOW)), [['in', 60, 'efectivo', 'Carrera'], ['in', 40, 'tarjeta', 'Carrera']]);
  // Si no cuadra, lo dice y no apunta
  const bad = ask('he cobrado 100, 60 en efectivo y 30 con tarjeta', state, NOW);
  assert.equal(bad.kind, 'answer');
  assert.match(bad.text, /No me cuadra/);
  assert.equal(payParts('20 en efectivo', 50), null);
});

test('correcciones de lo último: importe, forma de pago y tipo', () => {
  const done = { list: 'mov', items: [{ f: '2026-11-19', t: 'in', p: 'efectivo', i: 40, c: 'Carrera' }], refs: [], at: NOW.getTime() };
  const a = ask('No, eran 45, no 40', state, NOW, {}, { done });
  assert.equal(a.kind, 'amend');
  assert.deepEqual(a.changes, { i: 45 });
  assert.match(a.speech, /Corregido\. Ahora es ingreso de 45 euros en efectivo/);
  assert.deepEqual(ask('perdona, era con tarjeta', state, NOW, {}, { done }).changes, { p: 'tarjeta' });
  assert.deepEqual(ask('no, era un gasto', state, NOW, {}, { done }).changes, { t: 'out' });
  assert.deepEqual(ask('me he equivocado, eran 42 con tarjeta', state, NOW, {}, { done }).changes, { i: 42, p: 'tarjeta' });
  // Sin nada reciente, «no, eran 45» no cambia nada
  assert.notEqual(ask('No, eran 45', state, NOW, {}, {}).kind, 'amend');
  const old = { ...done, at: NOW.getTime() - 20 * 60e3 };
  assert.notEqual(ask('No, eran 45', state, NOW, {}, { done: old }).kind, 'amend', 'pasados 10 min ya no corrige por voz');
  // Mientras pregunta la forma de pago, «no, eran 45» cambia el importe y vuelve a preguntar
  const [, b, c] = talk('He cobrado 40 euros', 'no, eran 45', 'con tarjeta');
  assert.match(b.speech, /efectivo o con tarjeta/);
  assert.deepEqual(it(c), [['in', 45, 'tarjeta', 'Carrera']]);
});

test('no duplica: si repites la misma orden, pregunta', () => {
  const first = ask('apunta 30 euros en efectivo', state, NOW);
  const done = { list: 'mov', items: [first.action.item], refs: [], at: Date.now() };
  const again = ask('apunta 30 euros en efectivo', state, NOW, {}, { done });
  assert.equal(again.kind, 'confirm');
  assert.match(again.text, /ya lo apunté/);
  assert.equal(ask('sí', state, NOW, {}, again.ctx).kind, 'action');
  assert.match(ask('no', state, NOW, {}, again.ctx).text, /no lo apunto/);
  // Otro importe: se apunta sin preguntar
  assert.equal(ask('apunta 31 euros en efectivo', state, NOW, {}, { done }).kind, 'action');
});

test('quitar lo último siempre pide confirmación', () => {
  const done = { list: 'mov', items: [{ f: '2026-11-19', t: 'out', p: 'tarjeta', i: 12, c: 'Peaje' }], refs: [], at: NOW.getTime() };
  for (const q of ['borra lo último', 'quita el último gasto', 'deshazlo', 'me he equivocado']) {
    const r = ask(q, state, NOW, {}, { done });
    assert.equal(r.kind, 'confirm', q);
    assert.match(r.text, /¿Quito el gasto de 12,00\s€ con tarjeta \(Peaje\)\?/, q);
    assert.equal(ask('sí, quítalo', state, NOW, {}, r.ctx).kind, 'undo');
    assert.match(ask('no', state, NOW, {}, r.ctx).text, /lo dejo como está/);
  }
});

test('frases del encargo: consultas con datos reales', () => {
  assert.match(ask('¿Cuánto llevo ganado hoy?', state, NOW).text, /Hoy: \*\*159,50\s€ limpios/);
  assert.match(ask('¿Cuánto he ganado esta semana?', state, NOW).text, /Esta semana: \*\*386,00\s€ limpios/);
  const cash = ask('¿Cuánto tengo en efectivo?', state, NOW);
  assert.match(cash.text, /Hoy en efectivo: \*\*114,00\s€\*\* \(cobrado 120,00\s€ · pagado en efectivo 6,00\s€\)/);
  assert.match(ask('¿cuánto he cobrado con tarjeta esta semana?', state, NOW).text, /con tarjeta: \*\*245,50\s€\*\*/);
  const srv = ask('¿Cuántos servicios he realizado este mes?', state, NOW);
  assert.match(srv.text, /Este mes: \*\*2 servicios\*\* realizados por 155,00\s€ \(1 sin cobrar\)/, 'el del día 20 aún no se ha hecho');
  const fac = ask('¿Cuánto llevo facturado este trimestre?', state, NOW);
  assert.match(fac.text, /Facturado este trimestre: \*\*330,00\s€\*\* en 3 facturas \(1 anulada, ya restada\)/);
  assert.match(ask('cuánto he facturado este mes', state, NOW).text, /\*\*220,00\s€\*\* en 2 facturas/);
  const gastos = ask('Muéstrame los gastos de ayer', state, NOW);
  assert.match(gastos.text, /Gastos ayer: \*\*53,50\s€\*\*\n• Gasolina: Repsol: 50,00\s€ · tarjeta\n• Café: 3,50\s€ · efectivo/);
  const rent = ask('¿Qué rentabilidad llevo este mes?', state, NOW);
  assert.match(rent.text, /Rentabilidad este mes: \*\*386,00\s€ limpios\*\* de 445,50\s€ \(te quedas el \*\*87 %\*\*\)/);
  assert.match(rent.text, /gasolina 50,00\s€/);
  assert.match(ask('¿cuál fue mi último servicio?', state, NOW).text, /15\/11.*Aeropuerto → Mijas.*60,00/);
  assert.match(ask('y ayer', state, NOW, {}, ask('¿Cuánto llevo ganado hoy?', state, NOW).ctx).text, /Ayer: \*\*26,50\s€ limpios/);
});

test('abrir pantallas y facturas por voz (sin inventar)', () => {
  assert.deepEqual([ask('abre la gasolina', state, NOW).kind, ask('abre la gasolina', state, NOW).view], ['nav', 'ga']);
  assert.equal(ask('llévame a la hucha', state, NOW).view, 'hu');
  assert.equal(ask('abre las facturas', state, NOW).view, 'fa');
  const f = ask('hazme una factura para Charly', state, NOW);
  assert.equal(f.kind, 'nav');
  assert.match(f.text, /se crean en la pantalla Facturas/);
});
