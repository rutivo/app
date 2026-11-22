// Diccionario de órdenes de Rutivo: muchas formas de decir lo mismo (y como las
// oye mal el reconocedor con ruido). Cada frase debe acabar en lo correcto.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ask } from '../js/asistente.js';

const NOW = new Date('2026-11-19T17:00:00');
const state = {
  mov: [{ f: '2026-11-19', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' }, { f: '2026-11-19', t: 'out', p: 'tarjeta', i: 6, c: 'Lavado' }],
  srv: [{ id: 'a', f: '2026-11-15', h: '10:00', cl: 'Charly Transfers', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'pendiente' }],
  gas: [], huc: [], jor: [], fac: [], cfg: { iva: 10 },
};

/** Lo que hace Rutivo con la frase: [tipo, importe, pago] al apuntar; '?pago' si pregunta cómo; o el tipo de respuesta. */
function what(q) {
  const r = ask(q, state, NOW, { noConfirm: true });
  if (r.kind === 'action') {
    const it = r.action.items ? r.action.items : [r.action.item];
    return it.map((x) => (x.t === 'in' ? 'ingreso ' : 'gasto ') + x.i + ' ' + x.p).join(' + ') + (r.action.gas ? ' +gasolina' : '');
  }
  if (r.ctx && r.ctx.slot) { const b = r.ctx.slot.base; return (b.t === 'in' ? 'ingreso ' : 'gasto ') + b.i + ' ?pago'; }
  if (r.ctx && r.ctx.pending) return '?importe';
  if (r.kind === 'nav') return 'abre ' + r.view;
  if (/No te he entendido/.test(r.text || '')) return 'NO ENTIENDE';
  const m = (r.text || '').match(/^\S+\s(\S+)/);
  return 'respuesta: ' + (r.text || '').split('\n')[0].slice(0, 40) + (m ? '' : '');
}

const WRITES = {
  // Ingresos
  'apúntame 30 euros en efectivo': 'ingreso 30 efectivo',
  'apunta 30 en efectivo': 'ingreso 30 efectivo',
  'anota 30 euros con tarjeta': 'ingreso 30 tarjeta',
  'anótame 45 con tarjeta': 'ingreso 45 tarjeta',
  'ingresa 30 euros en efectivo': 'ingreso 30 efectivo',
  'ingrésame 30 en efectivo': 'ingreso 30 efectivo',
  'ingresas 30 euros en efectivo': 'ingreso 30 efectivo',
  'ingresa treinta euros en efectivo': 'ingreso 30 efectivo',
  'mete 25 en efectivo': 'ingreso 25 efectivo',
  'méteme 25 con tarjeta': 'ingreso 25 tarjeta',
  'suma 40 euros en efectivo': 'ingreso 40 efectivo',
  'súmame 40 con tarjeta': 'ingreso 40 tarjeta',
  'pon 15 euros en efectivo': 'ingreso 15 efectivo',
  'ponme 15 con tarjeta': 'ingreso 15 tarjeta',
  'añade 35 euros en efectivo de un servicio': 'ingreso 35 efectivo',
  'añádeme 35 con tarjeta': 'ingreso 35 tarjeta',
  'agrega 20 euros en efectivo': 'ingreso 20 efectivo',
  'registra 50 euros con tarjeta': 'ingreso 50 tarjeta',
  'guarda 50 euros en efectivo': 'ingreso 50 efectivo',
  'he cobrado 80 euros con tarjeta': 'ingreso 80 tarjeta',
  'cobré 80 en efectivo': 'ingreso 80 efectivo',
  'acabo de cobrar 60 en efectivo': 'ingreso 60 efectivo',
  'me han pagado 70 con tarjeta': 'ingreso 70 tarjeta',
  'me ha pagado 70 en efectivo': 'ingreso 70 efectivo',
  'me pagaron 90 por bizum': 'ingreso 90 tarjeta',
  'he hecho una carrera de 25 euros en efectivo': 'ingreso 25 efectivo',
  'carrera de 25 con tarjeta': 'ingreso 25 tarjeta',
  'servicio de 60 euros con tarjeta': 'ingreso 60 tarjeta',
  'un servicio de 60 en efectivo': 'ingreso 60 efectivo',
  'nuevo servicio de 45 euros en efectivo': 'ingreso 45 efectivo',
  'viaje de 30 con tarjeta': 'ingreso 30 tarjeta',
  'traslado de 80 euros con tarjeta': 'ingreso 80 tarjeta',
  'he ganado 100 euros en efectivo': 'ingreso 100 efectivo',
  'he hecho 50 euros con tarjeta': 'ingreso 50 tarjeta',
  'propina de 5 euros en efectivo': 'ingreso 5 efectivo',
  'me han dejado 5 de propina en efectivo': 'ingreso 5 efectivo',
  'cobro de 40 en efectivo': 'ingreso 40 efectivo',
  'entrada de 40 euros con tarjeta': 'ingreso 40 tarjeta',
  'ingreso de 40 en efectivo': 'ingreso 40 efectivo',
  '40 euros en efectivo': 'ingreso 40 efectivo',
  '40 con tarjeta': 'ingreso 40 tarjeta',
  'treinta y cinco euros en metálico': 'ingreso 35 efectivo',
  'apúntame 12,50 en efectivo': 'ingreso 12.5 efectivo',
  'apúntame 12 con 50 con tarjeta': 'ingreso 12.5 tarjeta',
  'apúntame doce euros cincuenta en efectivo': 'ingreso 12.5 efectivo',
  'apúntame ciento veinte euros con tarjeta': 'ingreso 120 tarjeta',
  'apúntame 30 pavos en efectivo': 'ingreso 30 efectivo',
  'apúntame 30 euros con el datáfono': 'ingreso 30 tarjeta',
  'apúntame 30 euros por transferencia': 'ingreso 30 tarjeta',
  'apúntame 30 euros con la visa': 'ingreso 30 tarjeta',
  'apúntame 30 euros en cash': 'ingreso 30 efectivo',
  'apúntame 30 euros en billetes': 'ingreso 30 efectivo',
  // Gastos
  'apúntame un gasto de 12 euros en efectivo': 'gasto 12 efectivo',
  'gasto de 12 con tarjeta': 'gasto 12 tarjeta',
  'añade un gasto de 12 euros con tarjeta': 'gasto 12 tarjeta',
  'he gastado 12 euros en efectivo': 'gasto 12 efectivo',
  'gasté 12 con tarjeta': 'gasto 12 tarjeta',
  'he pagado 7 euros de parking con tarjeta': 'gasto 7 tarjeta',
  'pagué 3 euros de café en efectivo': 'gasto 3 efectivo',
  'peaje de 6 euros con tarjeta': 'gasto 6 tarjeta',
  'apunta 6 de peaje con tarjeta': 'gasto 6 tarjeta',
  'apúntame 20 de comida en efectivo': 'gasto 20 efectivo',
  'apúntame 15 del lavado con tarjeta': 'gasto 15 tarjeta',
  'taller 200 euros con tarjeta': 'gasto 200 tarjeta',
  'apúntame 200 euros del taller con tarjeta': 'gasto 200 tarjeta',
  'he pagado el seguro 300 euros con tarjeta': 'gasto 300 tarjeta',
  'apúntame 60 de la cuota de autónomos con tarjeta': 'gasto 60 tarjeta',
  'apúntame 20 como gasto en efectivo': 'gasto 20 efectivo',
  'salida de 20 euros en efectivo': 'gasto 20 efectivo',
  // Gasolina
  'apunta 25 euros de gasolina con tarjeta': 'gasto 25 tarjeta +gasolina',
  'he echado 40 de gasoil con tarjeta': 'gasto 40 tarjeta +gasolina',
  'he repostado 50 euros en efectivo': 'gasto 50 efectivo +gasolina',
  'gasolina 45 con tarjeta': 'gasto 45 tarjeta +gasolina',
  'diésel 60 euros con tarjeta': 'gasto 60 tarjeta +gasolina',
  'he puesto 30 de gasolina en efectivo': 'gasto 30 efectivo +gasolina',
  'echado 30 de gasoil con tarjeta': 'gasto 30 tarjeta +gasolina',
  // Sin forma de pago: pregunta
  'apúntame 30 euros': 'ingreso 30 ?pago',
  'he cobrado 50': 'ingreso 50 ?pago',
  'añade un gasto de 12 euros': 'gasto 12 ?pago',
  'apunta 25 de gasolina': 'gasto 25 ?pago',
  // Reparto
  'he cobrado 100, la mitad en efectivo y la mitad con tarjeta': 'ingreso 50 efectivo + ingreso 50 tarjeta',
  'apúntame 80, 50 en efectivo y 30 con tarjeta': 'ingreso 50 efectivo + ingreso 30 tarjeta',
  // Como lo escribe el reconocedor (signos, €, orden cambiado, palabras pegadas)
  'Apúntame, 30 euros, en efectivo.': 'ingreso 30 efectivo',
  'Ingresa 30€ en efectivo.': 'ingreso 30 efectivo',
  'Ingresa 30 € efectivo': 'ingreso 30 efectivo',
  '30 euros efectivo': 'ingreso 30 efectivo',
  'efectivo 30 euros': 'ingreso 30 efectivo',
  'con tarjeta 45 euros': 'ingreso 45 tarjeta',
  'A punto 30 euros en efectivo.': 'ingreso 30 efectivo',
  'Apúntame 30 euros en efectivos.': 'ingreso 30 efectivo',
  'Apúntame 30 euros con tarjetas.': 'ingreso 30 tarjeta',
  'Ingresas. 30 euros en efectivo.': 'ingreso 30 efectivo',
  'Apuntame 30 euros en efectiva.': 'ingreso 30 efectivo',
  'Oye Rutivo, apúntame 30 euros con tarjeta.': 'ingreso 30 tarjeta',
  'Rutivo, gasto de 10 euros en efectivo.': 'gasto 10 efectivo',
  'Vale, pues apúntame 20 con tarjeta.': 'ingreso 20 tarjeta',
  'Apúntame 1.200 euros con tarjeta': 'ingreso 1200 tarjeta',
  'apúntame mil doscientos euros con tarjeta': 'ingreso 1200 tarjeta',
  'apúntame 7 euros 50 en efectivo': 'ingreso 7.5 efectivo',
  // Falta el importe
  'apúntame un servicio': '?importe',
  'quiero apuntar un gasto': '?importe',
  'ingresa': '?importe',
  'ingresas.': '?importe',
};

const QUERIES = {
  '¿cuánto llevo hoy?': /^respuesta: 💶 Hoy/,
  '¿cuánto he ganado hoy?': /^respuesta: 💶 Hoy/,
  '¿cuánto he hecho hoy?': /^respuesta: 💶 Hoy/,
  '¿cuánto he facturado hoy?': /^respuesta: 🧾/,
  '¿cómo voy?': /^respuesta: 💶 Hoy/,
  '¿qué tal el día?': /^respuesta: (💶|📋)/,
  'dime cuánto llevo esta semana': /^respuesta: 💶 Esta semana/,
  '¿cuánto gané ayer?': /^respuesta: 💶 Ayer/,
  '¿cuánto he ganado este mes?': /^respuesta: 💶 Este mes/,
  '¿cuánto tengo en efectivo?': /^respuesta: 💵/,
  '¿cuánto llevo en efectivo?': /^respuesta: 💵/,
  '¿cuánto dinero tengo en metálico?': /^respuesta: 💵/,
  '¿cuánto he cobrado con tarjeta?': /^respuesta: 💳/,
  '¿cuánto llevo con tarjeta?': /^respuesta: 💳/,
  '¿cuántos servicios he hecho este mes?': /^respuesta: 🚖/,
  '¿cuántos servicios llevo hoy?': /^respuesta: 🚖/,
  '¿cuántas carreras llevo?': /^respuesta: 🚕/,
  '¿cuánto he gastado hoy?': /^respuesta: 🧾 Gastos hoy/,
  'muéstrame los gastos de ayer': /^respuesta: 🧾 (Gastos|No hay gastos apuntados) ayer/,
  'enséñame los gastos de esta semana': /^respuesta: 🧾 Gastos esta semana/,
  'dime los gastos del mes': /^respuesta: 🧾 Gastos este mes/,
  '¿cuánto llevo de gasolina este mes?': /^respuesta: ⛽/,
  '¿cuánto gasto en gasolina?': /^respuesta: ⛽/,
  '¿qué rentabilidad llevo este mes?': /^respuesta: 📊/,
  '¿cuánto beneficio llevo?': /^respuesta: 📊/,
  '¿cuál es mi margen?': /^respuesta: 📊/,
  '¿cuánto llevo facturado este trimestre?': /^respuesta: 🧾/,
  '¿cuánto IVA pago este trimestre?': /^respuesta: 🧾 Trimestre/,
  '¿quién me debe dinero?': /^respuesta: ⏳/,
  '¿cuánto me debe Charly?': /^respuesta: ⏳/,
  '¿qué tengo mañana?': /^respuesta: 🗓️|^respuesta: 🚖/,
  '¿cuál es mi próximo servicio?': /^respuesta: (🗓️|🚖)/,
  '¿cuál fue mi último servicio?': /^respuesta: 🚖 Tu último/,
  '¿cuánto fue la última carrera?': /^respuesta: 💶 Lo último/,
  'dame el resumen del día': /^respuesta: 📋/,
  '¿qué he apuntado hoy?': /^respuesta: 📝/,
  '¿cómo va la hucha?': /^respuesta: 🐷 La Hucha ya no está/,
  'mete 10 en la hucha': /^respuesta: 🐷 La Hucha ya no está/,
  'ahorra 15 euros': /^respuesta: 🐷 La Hucha ya no está/,
  'abre la gasolina': /^abre ga$/,
  'llévame a facturas': /^abre fa$/,
  'abre la caja': /^abre hoy$/,
  've al panel': /^abre pa$/,
  'abre transfer': /^abre tr$/,
};

test('diccionario: órdenes de apuntar (todas las formas)', () => {
  const bad = [];
  for (const [q, want] of Object.entries(WRITES)) { const got = what(q); if (got !== want) bad.push(q + ' → ' + got + ' (quería ' + want + ')'); }
  assert.deepEqual(bad, []);
});

test('diccionario: preguntas (todas las formas)', () => {
  const bad = [];
  for (const [q, want] of Object.entries(QUERIES)) { const got = what(q); if (!want.test(got)) bad.push(q + ' → ' + got); }
  assert.deepEqual(bad, []);
});
