import assert from 'node:assert/strict';
import { test } from 'node:test';

// localStorage mínimo para Node
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const { tr, setLang, lang } = await import('../js/i18n.js');

test('en español (por defecto) no cambia nada', () => {
  setLang('es');
  assert.equal(lang(), 'es');
  assert.equal(tr('Caja diaria'), 'Caja diaria');
});

test('en inglés: textos fijos, con números y fechas', () => {
  setLang('en');
  assert.equal(tr('Caja diaria'), 'Daily cash');
  assert.equal(tr('  Guardar movimiento '), '  Save entry ', 'conserva los espacios');
  assert.equal(tr('Hoy 20:50'), 'Today 20:50');
  assert.equal(tr('Noviembre 2026: lo que llevas'), 'November 2026: so far');
  assert.equal(tr('3 facturas · 107.1 litros'), '3 receipts · 107.1 litres');
  assert.equal(tr('🎯 Objetivo: 303,00 € de 250,00 € · ¡Conseguido! 🎉'), '🎯 Goal: 303,00 € of 250,00 € · Achieved! 🎉');
  assert.equal(tr('🚗 Sal a las 21:29 (en 2 h 38 min) · 51 min de camino'), '🚗 Leave at 21:29 (in 2 h 38 min) · 51 min drive');
  assert.equal(tr('21/11/2026 20:50 · Aeropuerto de Málaga T3 a Marbella'), '21/11/2026 20:50 · Aeropuerto de Málaga T3 to Marbella');
  assert.equal(tr('Recogida en 15 min'), 'Pickup in 15 min');
  assert.equal(tr('📝 No olvides apuntar lo de hoy'), '📝 Don’t forget to record today');
});

test('tus datos no se traducen (nombres, sitios, conceptos propios)', () => {
  setLang('en');
  for (const s of ['Viajes Costa S.L.', 'Carrera estación', 'Marbella', 'Richard Smith', 'Hotel Don Pepe']) assert.equal(tr(s), s);
  setLang('es');
});
