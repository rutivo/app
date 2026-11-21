import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wakeMatch } from '../js/despertar.js';

test('«Oye Rutivo» y variantes que oye Whisper', () => {
  for (const t of ['Oye Rutivo.', 'oye, rutivo', 'Hey Rutibo', 'Rutivo', 'Oye Ruti vo', 'Hoy Rutivo', 'Hoy el rutivo apuntame 15 euros', 'Hoy el ruto apunta a 15 euros']) assert.ok(wakeMatch(t), t);
  assert.equal(wakeMatch('Oye Rutivo, apúntame 20 euros en tarjeta').rest, 'apúntame 20 euros en tarjeta');
});

test('no se despierta con frases normales ni con la radio', () => {
  for (const t of ['Oye, ¿qué hora es?', 'Hoy hace buen tiempo en Málaga', 'el aeropuerto está lleno', 'ayer fuimos con el rutivo de mi primo a la playa', '']) assert.equal(wakeMatch(t), null, t);
});

test('«Oyee Rutivo» (alargando la e)', () => {
  assert.equal(wakeMatch('Oyee Rutivo apúntame 15 € en efectivo por carrera 1').rest, 'apúntame 15 € en efectivo por carrera 1');
});

test('más formas de oír «Rutivo» (parecidas) y de llamarlo', () => {
  for (const t of ['Oye Rutiba', 'Oye, Rotivo.', 'Oye Rudivo', 'Oyerutivo', 'Hey rutivo apunta', 'Hola Rutivo', 'Oiga Rutivo',
    'Venga Rutivo, apúntame 10', 'Escucha Rutivo', 'Oye Brutivo', 'Oye Reutivo', 'Oye, ¿Rutivo?', 'Ruti vo apúntame', 'Oye ruti bo', 'Oye Ritivo',
    'Vale, oye Rutivo', 'Buenos días Rutivo', 'Oye Rutibos']) assert.ok(wakeMatch(t), t);
  assert.equal(wakeMatch('Oyerutivo apúntame 15 euros').rest, 'apúntame 15 euros');
  assert.equal(wakeMatch('Hola Rutivo, ¿cuánto llevo hoy?').rest, 'cuánto llevo hoy?');
});

test('palabras parecidas que NO son «Rutivo» no lo despiertan', () => {
  for (const t of ['Oye, qué ruido hace el coche', 'Oye la ruta de hoy', 'Oye, qué rico', 'Hola, buenas tardes', 'Por motivo de la obra',
    'Es un día festivo', 'Vamos por la rutina', 'Oye rotativo', 'Mi primo dice que el rutivo es bueno', 'Oye, ¿vienes o no?']) assert.equal(wakeMatch(t), null, t);
});
