// Asistente: transfers por voz. Crear un servicio (con fecha, hora, trayecto, precio,
// vuelo y pasajero), preguntar por un cliente (hora, vuelo, dónde, teléfono, precio),
// abrir el enlace / un mensaje / llamar / la ruta, cobrar un servicio y callarse.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ask, dateOf, describeDone, newServiceOf, serviceOf, timeOf } from '../js/asistente.js';

process.env.TZ = 'Europe/Madrid';
const NOW = new Date('2026-11-22T17:00:00'); // domingo
const DAY = '2026-11-22';
const state = {
  mov: [{ f: DAY, t: 'in', p: 'efectivo', i: 120, c: 'Carrera' }],
  srv: [
    { id: 'a', f: DAY, h: '19:30', cl: 'Viajes Costa', o: 'Aeropuerto de Málaga T3', d: 'Marbella', i: 95, p: 'pendiente', pa: 'John Smith', vu: 'BA490', tl: '+447700900123' },
    { id: 'b', f: '2026-11-23', h: '09:00', cl: 'Hotel Riu', o: 'Torremolinos', d: 'Aeropuerto de Málaga T3', i: 40, p: 'tarjeta', pa: 'Laura Gómez' },
    { id: 'c', f: '2026-11-18', h: '10:00', cl: 'SunTours', o: 'Málaga', d: 'Ronda', i: 210, p: 'pendiente', pa: 'Familia Müller' },
  ],
  gas: [], huc: [], jor: [], fac: [], cli: {}, cfg: { iva: 10, nom: 'Alejandro', punto: 'puerta 3, junto a la cafetería' },
};
const q = (text, ctx = {}, helpers = {}) => ask(text, state, NOW, helpers, ctx);

test('fechas y horas dichas de palabra', () => {
  assert.equal(dateOf('manana a las 10', DAY), '2026-11-23');
  assert.equal(dateOf('pasado manana', DAY), '2026-11-24');
  assert.equal(dateOf('el viernes', DAY), '2026-11-27');
  assert.equal(dateOf('el domingo', DAY), '2026-11-29'); // hoy es domingo: el que viene
  assert.equal(dateOf('el 25 de diciembre', DAY), '2026-12-25');
  assert.equal(dateOf('el 3', DAY), '2026-12-03'); // el 3 ya pasó este mes
  assert.equal(dateOf('a las 10 de la manana', DAY), null); // «de la mañana» no es «mañana»
  assert.equal(timeOf('a las 10'), '10:00');
  assert.equal(timeOf('a las 10 30'), '10:30');
  assert.equal(timeOf('a las 8 y media'), '08:30');
  assert.equal(timeOf('a las 9 menos cuarto'), '08:45');
  assert.equal(timeOf('a las 7 de la tarde'), '19:00');
  assert.equal(timeOf('a las 2 de la noche'), '02:00');
  assert.equal(timeOf('a la 1 y cuarto'), '01:15');
});

test('apuntar un transfer de palabra: se entiende todo y SIEMPRE se pregunta antes', () => {
  const r = q('Apunta un transfer mañana a las 10 del aeropuerto a Marbella por 95 euros');
  assert.equal(r.kind, 'confirm');
  const it = r.ctx.confirm.action.item;
  assert.equal(r.ctx.confirm.action.list, 'srv');
  assert.deepEqual([it.f, it.h, it.o, it.d, it.i, it.p], ['2026-11-23', '10:00', 'Aeropuerto de Málaga T3', 'Marbella', 95, 'pendiente']);
  assert.match(r.text, /mañana a las 10:00: Aeropuerto de Málaga T3 → Marbella · 95,00\s€/);
  // El sitio se escribe como ya lo tienes en tus servicios (con tildes): «aeropuerto» → «Aeropuerto de Málaga T3»
  const b = q('apúntame un servicio el viernes a las 8 y media de Torremolinos al aeropuerto de málaga t3 40 euros').ctx.confirm.action.item;
  assert.deepEqual([b.f, b.h, b.o, b.d, b.i], ['2026-11-27', '08:30', 'Torremolinos', 'Aeropuerto de Málaga T3', 40]);
  const c = q('apunta un transfer el 25 de diciembre a las 7 de la tarde del aeropuerto a Nerja vuelo BA 490 para John Smith 120 euros').ctx.confirm.action.item;
  assert.deepEqual([c.f, c.h, c.o, c.d, c.vu, c.pa, c.i], ['2026-12-25', '19:00', 'Aeropuerto de Málaga T3', 'Nerja', 'BA490', 'John Smith', 120]);
  // Le falta algo: lo dice (y se puede completar en Transfer)
  const d = q('tengo un servicio mañana a las 7');
  assert.match(d.text, /Falta el trayecto, el precio/);
  // «Sí» → se apunta
  const yes = q('sí', d.ctx);
  assert.equal(yes.kind, 'action');
  assert.equal(yes.action.list, 'srv');
  // NUNCA como dinero cobrado en la caja (antes pasaba)
  assert.notEqual(r.kind, 'action');
  // Una pregunta no crea nada
  assert.equal(newServiceOf('que servicios tengo manana', state, DAY, NOW.getTime()), null);
});

test('preguntar por un cliente: hora, vuelo, dónde, teléfono, precio', () => {
  assert.match(q('¿A qué hora es la recogida de John?').text, /John Smith\*\*: hoy a las 19:30 · Aeropuerto de Málaga T3 → Marbella · vuelo BA490/);
  const f = q('¿Cómo va el vuelo de John?', {}, { flightLine: () => 'Llega 19:42 (+12 min)' });
  assert.deepEqual([f.kind, f.what, f.id], ['open', 'flight', 'a']);
  assert.match(f.text, /BA490.*Llega 19:42 \(\+12 min\)/);
  assert.equal(q('el vuelo de John viene con retraso').what, 'flight');
  assert.equal(q('a qué terminal llega John').what, 'flight');
  assert.match(q('qué vuelo trae Laura').text, /no tiene vuelo apuntado/);
  assert.match(q('¿Dónde tengo que esperar a John?').text, /Aeropuerto de Málaga T3.*puerta 3, junto a la cafetería/);
  assert.match(q('¿Cuál es el teléfono de John?').text, /\+447700900123/);
  assert.match(q('¿Cuánto cobro a John?').text, /95,00\s€\*\* · pendiente de cobro/);
  // «el cliente» / «el próximo»: el servicio siguiente
  assert.equal(serviceOf('el cliente', state, NOW.getTime()).id, 'a');
  // No se confunde con la hora ni con el historial
  assert.match(q('¿Qué hora es?').text, /Son las/);
  assert.match(q('¿Cuándo llevé a John?').text, /1 servicio\. El último/);
});

test('hacer cosas con un servicio: enlace, mensaje, llamar, llevarme (se abren; tú tocas enviar)', () => {
  assert.deepEqual(['what', 'id'].map((k) => q('Mándale el enlace a John')[k]), ['link', 'a']);
  assert.equal(q('manda el enlace al cliente').id, 'a');
  const m = q('Dile a John que llego en 10 minutos');
  assert.deepEqual([m.what, m.tpl, m.min], ['msg', 'llego', 10]);
  assert.equal(q('dile a John que ya estoy en llegadas').tpl, 'llegadas');
  assert.equal(q('manda un mensaje a John que su vuelo viene con retraso').tpl, 'retraso');
  assert.equal(q('Llama a John').what, 'call');
  assert.match(q('llama a Laura').text, /No tengo el teléfono/);
  assert.deepEqual([q('Llévame a la recogida').what, q('Llévame a la recogida').place], ['route', 'Aeropuerto de Málaga T3']);
  assert.equal(q('llévame al destino de John').place, 'Marbella');
  assert.equal(q('¿Cómo llego a Marbella?').place, 'Marbella');
  assert.equal(q('llévame a la caja').kind, 'nav'); // las pantallas siguen siendo pantallas
  assert.match(q('mándale el enlace').text, /¿A quién\?/);
});

test('cobrar un servicio de palabra: pregunta la forma de pago y confirma antes', () => {
  const a = q('SunTours me ha pagado');
  assert.match(a.text, /SunTours · Familia Müller.*efectivo o con tarjeta/);
  const b = q('con tarjeta', a.ctx);
  assert.deepEqual([b.kind, b.action.list, b.action.id, b.action.p], ['action', 'pay', 'c', 'tarjeta']);
  const c = q('cobra el servicio de John en efectivo');
  assert.equal(c.kind, 'confirm');
  assert.deepEqual(c.ctx.confirm.action, { list: 'pay', id: 'a', p: 'efectivo' });
  assert.match(describeDone({ list: 'pay', items: [{ t: 'in', p: 'efectivo', i: 95, c: 'Transfer: Viajes Costa' }] }), /el cobro de 95,00\s€ en efectivo/);
  assert.match(describeDone({ list: 'srv', items: [{ f: '2026-11-23', h: '10:00', o: 'Aeropuerto', d: 'Marbella' }] }), /el transfer del 23\/11\/2026 a las 10:00/);
});

test('callarse, ayuda, manos libres, objetivo y clientes', () => {
  for (const w of ['para', 'silencio', 'calla', 'cállate', 'basta', 'cancela']) assert.equal(q(w).kind, 'stop', w);
  assert.match(q('¿Qué puedes hacer?').text, /Transfers/);
  assert.match(q('pon el modo manos libres').text, /Oye Rutivo/);
  assert.match(q('¿Cuánto me queda para el objetivo?').text, /Aún no tienes un objetivo/);
  assert.match(ask('¿cuánto me falta para el objetivo?', { ...state, cfg: { ...state.cfg, objDia: 200 } }, NOW).text, /te faltan \*\*80,00\s€/);
  assert.match(q('¿Cuántos clientes tengo?').text, /pasajeros/);
  assert.match(q('¿Qué servicios tengo mañana?').text, /Mañana a las 09:00/);
});
