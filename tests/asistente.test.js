import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ask as ask0, normalize, periodOf, spoken } from '../js/asistente.js';

// Si Rutivo pregunta «¿En efectivo o con tarjeta?» (no se dijo), se contesta «en efectivo»
// (antes daba por hecho efectivo sin preguntar; las pruebas de abajo siguen valiendo).
const ask = (q, st, now, h = {}, c = {}) => { const r = ask0(q, st, now, h, c); return r.ctx && r.ctx.slot ? ask0('en efectivo', st, now, h, r.ctx) : r; };

const NOW = new Date('2026-11-19T17:00:00');
const state = {
  mov: [
    { f: '2026-11-19', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' },
    { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 45.5, c: 'Carrera' },
    { f: '2026-11-19', t: 'out', p: 'efectivo', i: 6, c: 'Lavado' },
    { f: '2026-11-18', t: 'in', p: 'efectivo', i: 80, c: 'Carrera' },
    { f: '2026-10-10', t: 'in', p: 'tarjeta', i: 300, c: 'Carrera' },
    { f: '2026-10-11', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina: Repsol' },
    { f: '2026-11-05', t: 'out', p: 'tarjeta', i: 55, c: 'Gasolina: Cepsa' }, // el gasto que crea el ticket de gasolina de noviembre
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

test('gasolina, IVA y km; la Hucha ya no está', () => {
  assert.match(ask('cuanto gasto en gasolina', state, NOW).text, /este mes: \*\*55,00\s€\*\* · 37 L/);
  assert.match(ask('cuanto iva pago este trimestre', state, NOW).text, /Trimestre 2026 T4: ingresos \*\*545,50\s€\*\*/);
  assert.match(ask('cuantos kilometros llevo este mes', state, NOW).text, /\*\*350 km\*\* · \*\*18 h\*\* en 2 jornadas/);
  assert.match(ask('como va mi hucha', state, NOW).text, /La Hucha ya no está en Rutivo/);
});

test('órdenes: apuntar carreras y gastos (lo de la hucha no se apunta como otra cosa)', () => {
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
  assert.equal(e.kind, 'answer');
  assert.match(e.text, /La Hucha ya no está/);
  assert.equal(e.action, undefined);
  const g = ask('he pagado 50 de gasolina con tarjeta', state, NOW);
  assert.deepEqual(g.action.item, { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 50, c: 'Gasolina' });
});

test('si el usuario no necesita nada, Rutivo se despide con la frase de activación', () => {
  const r = ask('nada', state, NOW);
  assert.match(r.text, /¡Ah, genial! Si me necesitas, recuerda: solo tienes que decir «Oye Rutivo» y te atenderé\./);
  assert.match(r.speech, /solo tienes que decir Oye Rutivo y te atenderé/);
  assert.deepEqual(r.ctx, {});
  for (const phrase of ['no necesito nada', 'no gracias', 'por ahora nada', 'de momento nada']) {
    assert.match(ask(phrase, state, NOW).text, /¡Ah, genial!/);
  }
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
  assert.deepEqual(item('contabiliza 18 euros en efectivo'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 18, c: 'Carrera' });
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
  // Quitar lo último: pregunta antes (y si no hay nada reciente, lo dice)
  assert.match(ask('borra lo último', state, NOW).text, /No hay nada reciente/);
  const done = { list: 'mov', items: [{ f: '2026-11-19', t: 'in', p: 'tarjeta', i: 35, c: 'Carrera' }], refs: [], at: NOW.getTime() };
  const u = ask('borra lo último', state, NOW, {}, { done });
  assert.equal(u.kind, 'confirm');
  assert.equal(ask('sí', state, NOW, {}, u.ctx).kind, 'undo');
  assert.equal(ask('me he equivocado', state, NOW, {}, { done }).kind, 'confirm');
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
  assert.deepEqual(item('he pagado 9 y medio de desayuno'), { f: '2026-11-19', t: 'out', p: 'efectivo', i: 9.5, c: 'Desayuno' });
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

test('con ruido: palabras mal oídas, números colados y confirmación', () => {
  const item = (q) => ask(q, state, NOW).action?.item;
  assert.deepEqual(item('apúntame 12 héroes en efectiva'), { f: '2026-11-19', t: 'in', p: 'efectivo', i: 12, c: 'Carrera' });
  assert.deepEqual(item('apuntamos 30 en targeta'), { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 30, c: 'Carrera' });
  // La radio dice números: vale el que va con «euros» / detrás de «apunta»
  assert.equal(item('en la radio 3 y 7 apunta 25 euros con tarjeta').i, 25);
  assert.equal(item('carril 2 apúntame 40 en efectivo').i, 40);
  // Frase larga (mucho ruido) → pregunta antes de apuntar
  const long = ask('bla bla la radio y el tráfico están fatal hoy en la autovía apúntame 18 euros con tarjeta vale gracias', state, NOW);
  assert.equal(long.kind, 'confirm');
  assert.match(long.text, /¿Apunto \*\*18,00\s€ \(Carrera\) con tarjeta\*\*\?/);
  assert.deepEqual(ask('sí', state, NOW, {}, long.ctx).action.item, { f: '2026-11-19', t: 'in', p: 'tarjeta', i: 18, c: 'Carrera' });
  assert.match(ask('no', state, NOW, {}, long.ctx).text, /no lo apunto/);
  // El móvil dice que no está seguro de lo que oyó → también pregunta
  assert.equal(ask('apunta 20 euros en efectivo', state, NOW, { confidence: 0.4 }).kind, 'confirm');
  assert.equal(ask('apunta 20 euros en efectivo', state, NOW, { confidence: 0.9 }).kind, 'action');
  assert.equal(ask('apunta 20 euros en efectivo', state, NOW, { confidence: 0 }).kind, 'action'); // 0 = el iPhone no lo dice
});

test('micrófono propio: detector de voz con ruido de fondo', async () => {
  const { createVad, resample } = await import('../js/microfono.js');
  const v = createVad({ chunkMs: 100, silenceMs: 1000 });
  const run = (levels) => levels.map((l) => v.push(l));
  // Coche con ruido (0,02) → habla (0,15) → vuelve el ruido: acaba tras 1 s de «silencio»
  const s = run([0.02, 0.022, 0.019, 0.021, 0.15, 0.16, 0.14, 0.15, 0.02, 0.021, 0.02, 0.019, 0.02, 0.021, 0.02, 0.02, 0.02, 0.02]);
  assert.equal(s[5], 'speech');
  assert.equal(s.at(-1), 'end');
  // Solo ruido (aunque fuerte): no cuenta como voz y acaba por tiempo
  const v2 = createVad({ chunkMs: 500, waitMs: 3000 });
  const s2 = [0.08, 0.09, 0.085, 0.08, 0.09, 0.085].map((l) => v2.push(l));
  assert.equal(s2.at(-1), 'timeout');
  assert.equal(resample(new Float32Array(48000), 48000).length, 16000);
});

test('lo que oye Whisper: «a punto de 15 euros…» es «apúntame 15 euros…»', () => {
  assert.deepEqual(ask('A punto de 15 euros como gasto en tarjeta.', state, NOW).action.item, { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 15, c: 'Gasto' });
});

import { trimChatter } from '../js/asistente.js';
test('trimChatter quita la charla de fondo antes de la orden', () => {
  assert.equal(trimChatter('Hoy estamos en la radio hablando del parque de 15 euros como gasto'), '15 euros como gasto');
  assert.equal(trimChatter('vale pues mira apúntame 20 euros'), 'vale pues mira apúntame 20 euros');
  assert.equal(trimChatter('cuánto he ganado hoy'), 'cuánto he ganado hoy');
});

test('variantes de «tarjeta» que oye Whisper con ruido', () => {
  for (const w of ['derjeta', 'terjeta', 'darjeta']) assert.match(normalize('15 euros en ' + w), /tarjeta/);
});

import { conceptOf } from '../js/asistente.js';
test('concepto tal como lo dices', () => {
  const cases = {
    'Oyee Rutivo apúntame 15 € en efectivo por carrera 1': 'Carrera 1',
    'apúntame 10€ en tarjeta para gasto por gasolina': 'Gasolina',
    'apúntame 30 en efectivo concepto propina de Richard': 'Propina de Richard',
    'apúntame 18 euros por la carrera de Richard en tarjeta.': 'Carrera de Richard',
    'gasto de 12 euros por parking del aeropuerto': 'Parking del aeropuerto',
    'apúntame 20 por tarjeta': '',
    'apúntame 40 euros en efectivo': '',
    'apunta 15 euros por favor': '',
    'apuntame 15 euros en efectivo por cadera 1.': 'Carrera 1',
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(conceptOf(q), want, q);
});

test('«Oyee Rutivo…» apunta ingreso o gasto con su concepto', () => {
  const st = { mov: [], srv: [], gas: [], huc: [], jor: [], fac: [], prv: [], cli: {}, cfg: {} };
  const a = ask('apúntame 15 € en efectivo por carrera 1', st, NOW, { noConfirm: true });
  assert.deepEqual([a.action.item.t, a.action.item.i, a.action.item.p, a.action.item.c], ['in', 15, 'efectivo', 'Carrera 1']);
  const b = ask('apúntame 10€ en tarjeta para gasto por gasolina', st, NOW, { noConfirm: true });
  assert.deepEqual([b.action.item.t, b.action.item.i, b.action.item.p, b.action.item.c], ['out', 10, 'tarjeta', 'Gasolina']);
  assert.match(a.speech, /por Carrera 1/);
});

test('frases de conducir: «quiero que me apuntes…», «de primera carrera, efectivo»', () => {
  const st = { mov: [{ c: 'Peaje AP-7' }], srv: [], gas: [], huc: [], jor: [], fac: [], prv: [], cli: {}, cfg: {} };
  const it = (q) => { const x = ask(q, st, NOW, { noConfirm: true }).action.item; return [x.t, x.i, x.p, x.c]; };
  assert.deepEqual(it('quiero que me apuntes 15 euros como ingreso de carrera'), ['in', 15, 'efectivo', 'Carrera']);
  assert.deepEqual(it('quiero que me apuntes 5 euros como gasto de peaje'), ['out', 5, 'efectivo', 'Peaje']);
  assert.deepEqual(it('apúntame 15 euros de primera carrera, efectivo'), ['in', 15, 'efectivo', 'Primera carrera']);
  assert.deepEqual(it('apunta un ingreso de 30 euros en efectivo de la carrera de Marbella'), ['in', 30, 'efectivo', 'Carrera de Marbella']);
  assert.deepEqual(it('me apuntas 12 euros de gasto de café'), ['out', 12, 'efectivo', 'Café']);
  // aprende: lo que ya usaste se escribe igual que siempre
  assert.deepEqual(it('apunta 6 euros de gasto de peaje ap7'), ['out', 6, 'efectivo', 'Peaje AP-7']);
  assert.deepEqual(it('apúntame 15 de primera carera'), ['in', 15, 'efectivo', 'Primera carrera']);
});

test('«¿qué palabras sabes?»: lo aprendido de tus apuntes', () => {
  const st = { mov: [{ c: 'Carrera 1' }, { c: 'Carrera 1' }, { c: 'Peaje AP-7' }], srv: [], gas: [], huc: [], jor: [], fac: [], prv: [], cli: {}, cfg: {} };
  assert.match(ask('¿qué palabras sabes?', st, NOW).text, /Carrera 1 · Peaje AP-7/);
});

test('más vocabulario: como se habla en la calle', () => {
  const act = (q) => { const r = ask(q, state, NOW); return r.action ? r.action.item : null; };
  // Andaluz: «cobrao», «pagao», «echao»
  let it = act('he cobrao 20 euros en efectivo');
  assert.ok(it && it.t === 'in' && it.i === 20 && it.p === 'efectivo', JSON.stringify(it));
  it = act('he pagao 6 de parking con tarjeta');
  assert.ok(it && it.t === 'out' && it.i === 6 && it.p === 'tarjeta' && /parking/i.test(it.c), JSON.stringify(it));
  it = act('he echao 40 de gasoil');
  assert.ok(it && it.t === 'out' && it.i === 40, JSON.stringify(it));
  // «pavos», «euritos»
  it = act('apúntame 15 pavos en efectivo');
  assert.ok(it && it.i === 15 && it.t === 'in', JSON.stringify(it));
  it = act('mete 3 euritos de propina');
  assert.ok(it && it.i === 3 && /propina/i.test(it.c), JSON.stringify(it));
  // «me han dado», «he sacado»
  it = act('me han dado 25 de una carrera');
  assert.ok(it && it.t === 'in' && it.i === 25, JSON.stringify(it));
  it = act('he sacado 30 en el aeropuerto');
  assert.ok(it && it.t === 'in' && it.i === 30, JSON.stringify(it));
  // «grábame», «apúntamelo»
  it = act('grábame 12 con tarjeta');
  assert.ok(it && it.i === 12 && it.p === 'tarjeta', JSON.stringify(it));
  // Formas de pago nuevas
  for (const q of ['apúntame 18 con apple pay', 'apúntame 18 con google pay', 'apúntame 18 con el reloj', 'apúntame 18 con la visa']) {
    it = act(q);
    assert.ok(it && it.p === 'tarjeta', q + ' ' + JSON.stringify(it));
  }
  // Gastos nuevos
  // Sin decir «pagué»: por la palabra sabe que es un GASTO (y el concepto queda tal como lo dices)
  for (const [q, c] of [['apúntame 2 de zona azul', /zona azul/i], ['apúntame 30 del pinchazo', /pinchazo/i], ['apúntame 1,50 de agua', /agua/i],
    ['apúntame 60 de la gestoría', /gestor/i], ['apúntame 5 del garaje', /garaje/i], ['apúntame 8 del túnel de lavado', /lavado/i],
    ['apúntame 45 de gasóleo', /gas/i], ['apúntame 3 de una tapa', /tapa/i]]) {
    it = act(q);
    assert.ok(it && it.t === 'out' && c.test(it.c), q + ' ' + JSON.stringify(it));
  }
  // Ingresos nuevos
  it = act('apúntame 10 de suplemento');
  assert.ok(it && it.t === 'in' && /suplemento/i.test(it.c), JSON.stringify(it));
  // Las preguntas siguen siendo preguntas
  assert.equal(ask('¿cuánto he ganado hoy?', state, NOW).action, undefined);
  assert.equal(ask('cuanto he sacado este mes', state, NOW).action, undefined);
});

test('«Apúntame X como gasto/ingreso en efectivo/tarjeta» (como lo dice el conductor)', () => {
  const it = (q) => { const r = ask(trimChatter(q), state, NOW); return r.action ? r.action.item : null; };
  const cases = [
    ['apúntame 20 como gasto en efectivo', 'out', 20, 'efectivo'], ['apúntame 20 como gasto con tarjeta', 'out', 20, 'tarjeta'],
    ['apúntame esto en ingreso de 30 en efectivo', 'in', 30, 'efectivo'], ['apúntame esto en ingreso de 30 con tarjeta', 'in', 30, 'tarjeta'],
    ['apúntame un ingreso de 45 en efectivo', 'in', 45, 'efectivo'], ['apúntame un gasto de 12 con tarjeta', 'out', 12, 'tarjeta'],
    ['apúntame cuarenta euros de ingreso en efectivo', 'in', 40, 'efectivo'], ['apúntame doce con cincuenta de gasto en tarjeta', 'out', 12.5, 'tarjeta'],
  ];
  for (const [q, t, i, p] of cases) {
    const x = it(q);
    assert.ok(x && x.t === t && x.i === i && x.p === p, q + ' → ' + JSON.stringify(x));
    assert.ok(!/^esto$/i.test(x.c), q + ': el concepto no es «esto» (' + x.c + ')');
  }
});

test('micro: no corta la frase por una pausa ni si empiezas a hablar nada más abrirlo', async () => {
  const { createVad } = await import('../js/microfono.js');
  const ck = (4096 / 48000) * 1000;
  const seg = (lvl, ms) => Array(Math.round(ms / ck)).fill(lvl);
  const endOf = (levels, opts) => { const v = createVad({ chunkMs: ck, silenceMs: 1400, shortMs: 600, follow: true, ...opts }); let end = null; levels.forEach((l, i) => { if (v.push(l) === 'end' && end === null) end = (i + 1) * ck; }); return end; };
  // «Ingresa… (pausa de 1,3 s pensando) …treinta en efectivo» (la captura: solo oyó «ingresas.»)
  const pausa = [...seg(0.01, 300), ...seg(0.08, 500), ...seg(0.012, 1300), ...seg(0.07, 900)];
  assert.ok(endOf([...pausa, ...seg(0.01, 3000)]) > pausa.length * ck, 'no corta en la pausa');
  // Empieza a hablar en cuanto se abre el micro
  const ya = [...seg(0.12, 500), ...seg(0.012, 250), ...seg(0.06, 400), ...seg(0.013, 250), ...seg(0.055, 450), ...seg(0.012, 300), ...seg(0.06, 600)];
  assert.ok(endOf([...ya, ...seg(0.01, 3000)]) > ya.length * ck, 'detecta la voz y espera al final');
  // Las palabras más bajas después de una fuerte siguen contando como voz
  const bajas = [...seg(0.01, 300), ...seg(0.1, 400), ...seg(0.03, 350), ...seg(0.045, 400), ...seg(0.028, 300), ...seg(0.04, 500)];
  assert.ok(endOf([...bajas, ...seg(0.01, 3000)]) > bajas.length * ck);
  // Coche con ruido fuerte: termina igual (no se queda escuchando para siempre)
  const coche = [...seg(0.04, 600), ...seg(0.15, 500), ...seg(0.09, 300), ...seg(0.14, 700)];
  const e = endOf([...coche, ...seg(0.04, 3000)]);
  assert.ok(e && e > coche.length * ck && e < coche.length * ck + 2200, String(e));
});

test('micro: aunque al callarte suba el ruido de fondo, la frase termina (antes se quedaba escuchando 15 s)', async () => {
  const { createVad } = await import('../js/microfono.js');
  const ck = (4096 / 48000) * 1000;
  // Silencio total al abrir, «Oye Rutivo» y después un ruido suave constante (el iPhone sube la ganancia al callarte)
  const voz = [0, 0, 0.088, 0.197, 0.232, 0.235, 0.121, 0.104, 0.238, 0.114, 0.025, 0.001, 0];
  const seq = [...Array(6).fill(0.001), ...voz, ...Array(80).fill(0.029)];
  const v = createVad({ chunkMs: ck, silenceMs: 1400, shortMs: 600, follow: true });
  const i = seq.map((l) => v.push(l)).indexOf('end');
  assert.ok(i > 0 && i * ck < (6 + voz.length) * ck + 3500, 'termina ' + Math.round(i * ck) + ' ms');
});

test('micro en iPhone sin modo «llamada» (si no, la voz de Rutivo sale muy baja)', async () => {
  const { micConstraints } = await import('../js/microfono.js');
  assert.equal(micConstraints(true).echoCancellation, false);
  assert.equal(micConstraints(false).echoCancellation, true);
});

test('el tiempo: el sitio que dices, o si no, donde estás', async () => {
  const { weatherPlace } = await import('../js/asistente.js');
  assert.equal(weatherPlace('¿Qué tiempo hace en Madrid?'), 'Madrid');
  assert.equal(weatherPlace('¿va a llover mañana en Sevilla?'), 'Sevilla');
  assert.equal(weatherPlace('¿Hace calor en San Sebastián hoy?'), 'San Sebastián');
  assert.equal(weatherPlace('¿Qué tiempo hace?'), '');
  assert.equal(weatherPlace('¿qué tiempo hace en la calle?'), '');
  assert.equal(ask('¿Qué tiempo hace en Madrid?', state, NOW).place, 'Madrid');
});

test('gasolina: el asistente cuenta lo mismo que las gráficas (también la apuntada a mano en la caja)', () => {
  const st = { ...state, mov: [...state.mov, { f: '2026-11-18', t: 'out', p: 'efectivo', i: 30, c: 'gasoil' }] };
  // 55 del ticket (su gasto en la caja) + 30 apuntados en la caja sin ticket = 85; litros solo de los tickets
  assert.match(ask('cuanto gasto en gasolina', st, NOW).text, /este mes: \*\*85,00\s€\*\* · 37 L · 1 ticket · 1,49\s€\/L/);
});
