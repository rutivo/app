import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAgencyService } from '../js/agency.js';

const SAMPLE = `Código Servicio: 48213
Fecha: 7/3/2026
Hora: 15:30
Nombre: ** HEIDI SACHMANN **
Vuelo: d85071
Origen: Aeropuerto de Málaga - AGP
Destino: ELVIRIA - Hotel Don Carlos - Recepción
Importe a cobrar al cliente: 45,50
Teléfono: +49 151 2345 6789`;

test('lee los campos del servicio de la agencia', () => {
  assert.deepEqual(parseAgencyService(SAMPLE), {
    date: '2026-03-07',
    time: '15:30',
    origin: 'Aeropuerto De Málaga',
    destination: 'Elviria',
    amount: 45.5,
    notes: 'Cód. 48213 · Hotel Don Carlos - Recepción',
    passenger: 'Heidi Sachmann',
    flight: 'D85071',
    phone: '+49 151 2345 6789',
  });
});

test('usa el importe de "no cobrar" si no hay importe a cobrar', () => {
  const s = parseAgencyService('Fecha: 1/1/2026\nNo cobrar 30,00 €');
  assert.equal(s.amount, 30);
});

test('devuelve null si el texto no tiene fecha', () => {
  assert.equal(parseAgencyService('hola'), null);
});

test('no falla con una fecha incompleta', () => {
  assert.ok(parseAgencyService('Fecha: 7'));
});
