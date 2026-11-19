import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ask, normalize, periodOf, spoken } from '../js/asistente.js';

const NOW = new Date('2026-11-19T17:00:00');
const state = {
  mov: [
    { f: '2026-11-19', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' },
    { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 45.5, c: 'Carrera' },
    { f: '2026-11-19', t: 'out', p: 'efectivo', i: 6, c: 'Lavado' },
    { f: '2026-11-18', t: 'in', p: 'efectivo', i: 80, c: 'Carrera' },
    { f: '2026-10-10', t: 'in', p: 'tarjeta', i: 300, c: 'Carrera' },
    { f: '2026-10-11', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina: Repsol' },
  ],
  srv: [
    { id: 'a', f: '2026-11-10', h: '10:00', cl: 'Charly Transfers', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'pendiente', pa: 'MR RICHARD SMITH' },
    { id: 'b', f: '2026-11-12', h: '12:00', cl: 'Charly Transfers', o: 'Nerja', d: 'Aeropuerto', i: 75, p: 'pendiente' },
    { id: 'c', f: '2026-11-15', h: '09:00', cl: 'Viajes Costa S.L.', o: 'Aeropuerto', d: 'Mijas', i: 60, p: 'tarjeta', pa: 'Ana López' },
    { id: 'd', f: '2026-11-20', h: '08:30', cl: 'Viajes Costa S.L.', o: 'Hotel Don Pepe', d: 'Aeropuerto', i: 70, p: 'pendiente', pa: 'Laura', vu: 'VY1234' },
  ],
  gas: [{ f: '2026-11-05', i: 55, l: 37 }, { f: '2026-10-11', i: 50, l: 34 }],
  huc: [{ f: '2026-11-01', i: 100, h: 'main' }],
  jor: [{ f: '2026-11-19', ki: 1000, kf: 1200, hi: '07:00', hf: '17:00' }, { f: '2026-11-18', ki: 800, kf: 950, hi: '08:00', hf: '16:00' }],
  fac: [],
  cfg: { iva: 10, hm: 500 },
};

test('números dichos con palabras y signos', () => {
  assert.equal(normalize('¿Cuánto llevo HOY?'), 'cuanto llevo hoy');
  assert.equal(normalize('Apunta cuarenta y cinco euros'), 'apunta 45 euros');
  assert.equal(normalize('ciento veinte con tarjeta'), '120 con tarjeta');
  assert.equal(normalize('45,50 €'), '45.50 euros');
  assert.equal(spoken(45.5), '45 con 50');
  assert.equal(spoken(1), '1 euro');
});

test('periodos', () => {
  assert.deepEqual(periodOf('ayer', '2026-11-19'), { from: '2026-11-18', to: '2026-11-18', label: 'ayer' });
  assert.equal(periodOf('el mes pasado', '2026-11-19').from, '2026-10-01');
  assert.equal(periodOf('en octubre', '2026-11-19').to, '2026-10-31');
  assert.equal(periodOf('en diciembre', '2026-11-19').from, '2025-12-01');
  assert.equal(periodOf('esta semana', '2026-11-19').from, '2026-11-16');
});

test('¿Cuánto llevo hoy?', () => {
  const r = ask('¿Cuánto llevo hoy?', state, NOW);
  assert.match(r.text, /Hoy: \*\*159,50\s€ limpios/);
  assert.match(r.speech, /^Hoy llevas 159 con 50 limpios/);
});

test('¿Cuánto gané el mes pasado?', () => {
  assert.match(ask('cuanto gane el mes pasado', state, NOW).text, /El mes pasado: \*\*250,00\s€ limpios/);
});

test('lo que me deben, en total y por cliente', () => {
  assert.match(ask('¿Quién me debe dinero?', state, NOW).text, /Te deben \*\*170,00\s€\*\* \(2 servicios\)/);
  assert.match(ask('cuanto me debe charly', state, NOW).text, /\*\*Charly Transfers\*\* te debe \*\*170,00\s€/);
  assert.match(ask('me debe viajes costa', state, NOW).text, /no te debe nada/); // el pendiente es de mañana
});

test('próximos servicios y mañana', () => {
  const r = ask('¿Qué tengo mañana?', state, NOW, { eta: () => '(llega 08:05)' });
  assert.match(r.text, /Mañana a las 08:30: Hotel Don Pepe → Aeropuerto · Laura · vuelo VY1234 \(llega 08:05\)/);
  assert.match(ask('cual es mi proximo servicio', state, NOW).text, /Mañana a las 08:30/);
});

test('¿Cuándo llevé a Richard?', () => {
  const r = ask('¿Cuándo llevé a Richard?', state, NOW);
  assert.match(r.text, /MR RICHARD SMITH\*\*: 1 servicio\. El último, el 10\/11\/2026/);
});

test('gasolina, IVA, km y hucha', () => {
  assert.match(ask('cuanto gasto en gasolina', state, NOW).text, /este mes: \*\*55,00\s€\*\* · 37 L/);
  assert.match(ask('cuanto iva pago este trimestre', state, NOW).text, /Trimestre 2026 T4: ingresos \*\*545,50\s€\*\*/);
  assert.match(ask('cuantos kilometros llevo este mes', state, NOW).text, /\*\*350 km\*\* · \*\*18 h\*\* en 2 jornadas/);
  assert.match(ask('como va mi hucha', state, NOW).text, /Mi hucha: \*\*100,00\s€\*\* de 500,00\s€ \(20 %\)/);
});

test('órdenes: apuntar carreras, gastos y hucha', () => {
  const a = ask('Apunta 45 euros en efectivo', state, NOW);
  assert.equal(a.kind, 'action');
  assert.deepEqual(a.action, { list: 'mov', item: { f: '2026-11-19', t: 'in', p: 'efectivo', i: 45, c: 'Carrera' } });
  const b = ask('apunta cuarenta y cinco con tarjeta', state, NOW);
  assert.equal(b.action.item.i, 45);
  assert.equal(b.action.item.p, 'tarjeta');
  const c = ask('Gasto de 6 euros de lavado', state, NOW);
  assert.deepEqual(c.action.item, { f: '2026-11-19', t: 'out', p: 'efectivo', i: 6, c: 'Lavado' });
  const c2 = ask('carrera de 30 con tarjeta', state, NOW);
  assert.deepEqual(c2.action.item, { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 30, c: 'Carrera' });
  assert.equal(ask('cuanto gasto de gasolina', state, NOW).kind, 'answer');
  const d = ask('apunta un gasto de 6 euros de lavado', state, NOW);
  assert.deepEqual(d.action.item, { f: '2026-11-19', t: 'out', p: 'efectivo', i: 6, c: 'Lavado' });
  const e = ask('mete 10 en la hucha', state, NOW);
  assert.deepEqual(e.action, { list: 'huc', item: { f: '2026-11-19', i: 10, h: 'main' } });
  const g = ask('he pagado 50 de gasolina con tarjeta', state, NOW);
  assert.deepEqual(g.action.item, { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina' });
});

test('si no entiende, lo dice y da ejemplos', () => {
  assert.match(ask('dame la receta de la paella', state, NOW).text, /No te he entendido/);
});

test('conversación: saluda por tu nombre, pregunta qué tal y reacciona', () => {
  const s = { ...state, cfg: { ...state.cfg, nom: 'Alejandro García' } };
  const h = ask('Hola', s, NOW);
  assert.match(h.text, /^👋 ¡Hola, Alejandro! (¿Qué tal estás\?|¿Cómo estás\?|¿Qué tal va el día\?|¿Cómo va todo\?)$/);
  assert.equal(h.ctx.mood, true);
  const good = ask('bien, ¿y tú?', s, NOW, {}, h.ctx);
  assert.match(good.text, /Me alegro mucho! 😊 Hoy llevas \*\*159,50\s€\*\* limpios y tu próximo servicio es mañana a las 08:30 hacia Aeropuerto\./);
  const bad = ask('estoy reventado', s, NOW);
  assert.match(bad.text, /Ánimo! 💪 Por lo menos hoy ya llevas \*\*159,50\s€\*\*/);
  assert.match(ask('buenos días', s, NOW).text, /^👋 Buenos días, Alejandro\./);
  assert.match(ask('¿cómo estás?', s, NOW).text, /Muy bien, gracias! 😊 ¿Y tú, qué tal, Alejandro\?/);
  assert.match(ask('buenas noches', s, new Date('2026-11-19T22:30:00')).text, /Buenas noches, Alejandro\. Hoy llevas/);
  assert.match(ask('oye rutivo muchas gracias', s, NOW).text, /De nada|A mandar|Para eso estoy/);
  assert.match(ask('¿Qué hora es?', s, NOW).text, /Son las \*\*17:00\*\*/);
  assert.match(ask('cuéntame un chiste', s, NOW).text, /maleta/);
});

test('el tiempo: pregunta y texto con datos de Open-Meteo', async () => {
  const { weatherText } = await import('../js/asistente.js');
  assert.deepEqual([ask('¿qué tiempo hace?', state, NOW).kind, ask('va a llover mañana', state, NOW).when], ['weather', 'manana']);
  const d = { current: { temperature_2m: 19.4, weather_code: 0, wind_speed_10m: 12 },
    daily: { weather_code: [1, 61], temperature_2m_min: [13.6, 12.2], temperature_2m_max: [21.2, 18.7], precipitation_probability_max: [5, 80] } };
  const hoy = weatherText(d, 'hoy', 'Málaga');
  assert.equal(hoy.text, '☀️ En **Málaga** ahora hace **19 °C**, despejado.\nHoy entre 14 y 21 °C. No va a llover.');
  const man = weatherText(d, 'manana', 'Málaga', true);
  assert.equal(man.text, '🌧️ Mañana en **Málaga**: entre **12 y 19 °C**, con lluvia. Va a llover (80 %) ☂️.');
  assert.equal(man.speech, 'Mañana en Málaga, entre 12 y 19 grados, con lluvia. Va a llover.');
});

test('muchas formas de pedir que apunte', () => {
  const item = (q) => ask(q, state, NOW).action?.item;
  assert.deepEqual(item('que me ingrese 50 € en efectivo'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 50, c: 'Carrera' });
  assert.deepEqual(item('Ingrésame cincuenta euros'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 50, c: 'Carrera' });
  assert.deepEqual(item('ponme 30 con tarjeta'), { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 30, c: 'Carrera' });
  assert.deepEqual(item('me puedes apuntar 20 euros por favor'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 20, c: 'Carrera' });
  assert.deepEqual(item('me han pagado 95 por bizum'), { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 95, c: 'Carrera' });
  assert.deepEqual(item('50 euros en efectivo'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 50, c: 'Carrera' });
  assert.deepEqual(item('he echado 40 de gasoil'), { f: '2026-11-19', t: 'out', p: 'efectivo', i: 40, c: 'Gasolina' });
  assert.deepEqual(item('hola apunta 12 euros de peaje con tarjeta'), { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 12, c: 'Peaje' });
  assert.equal(ask('cuanto he cobrado hoy', state, NOW).kind, 'answer');
});

test('hilo de la conversación: «¿y ayer?» y completar el importe', () => {
  const a = ask('¿Cuánto llevo hoy?', state, NOW);
  const b = ask('¿y ayer?', state, NOW, {}, a.ctx);
  assert.match(b.text, /Ayer: \*\*80,00\s€ limpios/);
  const c = ask('y el mes pasado', state, NOW, {}, b.ctx);
  assert.match(c.text, /El mes pasado: \*\*250,00\s€/);
  const d = ask('apunta una carrera', state, NOW);
  assert.match(d.text, /¿De cuánto\?/);
  const e = ask('de 35 con tarjeta', state, NOW, {}, d.ctx);
  assert.deepEqual(e.action.item, { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 35, c: 'Carrera' });
  assert.equal(ask('borra lo último', state, NOW).kind, 'undo');
  assert.equal(ask('me he equivocado', state, NOW).kind, 'undo');
});

test('lo que dijiste tal cual: muletillas, plurales y «como ingreso»', () => {
  const item = (q) => ask(q, state, NOW).action?.item;
  assert.deepEqual(item('Digo apúntame 12 € en tarjetas como ingreso'), { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 12, c: 'Carrera' });
  assert.deepEqual(item('a púntame 20 euros en efectivo'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 20, c: 'Carrera' });
  assert.deepEqual(item('a ver, ingrésame 15 con 50 en mano'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 15.5, c: 'Carrera' });
  assert.deepEqual(item('pues 30 euros con el datáfono'), { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 30, c: 'Carrera' });
  assert.deepEqual(item('mete 5 de propina'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 5, c: 'Propina' });
  assert.deepEqual(item('pagué 7 euros de parking con tarjeta'), { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 7, c: 'Parking' });
  assert.deepEqual(item('apunta 120 euros del taller como gasto'), { f: '2026-11-19', t: 'out', p: 'efectivo', i: 120, c: 'Taller' });
  assert.deepEqual(item('he pagado 9 y medio de desayuno'), { f: '2026-11-19', t: 'out', p: 'efectivo', i: 9.5, c: 'Comida' });
  assert.deepEqual(item('repostado 60 euros'), { f: '2026-11-19', t: 'out', p: 'efectivo', i: 60, c: 'Gasolina' });
  assert.deepEqual(item('12 euros como ingreso'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 12, c: 'Carrera' });
  const h = ask('para poder apuntar las carreras', state, NOW);
  assert.match(h.text, /¿De cuánto\?/);
  assert.deepEqual(ask('35 en efectivo', state, NOW, {}, h.ctx).action.item, { f: '2026-11-19', t: 'in', p: 'efectivo', i: 35, c: 'Carrera' });
});

test('preguntas nuevas: resumen, cuántas carreras, qué he apuntado, cómo voy', () => {
  assert.match(ask('dame el resumen del día', state, NOW).text, /Resumen hoy\*\*\n💶 Limpio: \*\*159,50\s€\*\*\n⬆️ Ingresos: 165,50\s€ \(2 cobros\) · efectivo 120,00\s€ · tarjeta 45,50\s€/);
  assert.match(ask('cuántas carreras llevo hoy', state, NOW).text, /Hoy: \*\*2 cobros\*\* por 165,50\s€/);
  assert.match(ask('qué he apuntado hoy', state, NOW).text, /−6,00\s€ · Lavado/);
  assert.match(ask('cómo voy', state, NOW).text, /Hoy: \*\*159,50\s€ limpios/);
});
