import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDate, readService } from '../js/serviceReader.js';

const TODAY = '2026-11-19';

test('el formato de siempre sigue igual', () => {
  const r = readService('Código Servicio: 1\nFecha: 7/3/2027\nHora: 15:30\nNombre: ** HEIDI SACHMANN **\nVuelo: d85071\nOrigen: Aeropuerto de Málaga - AGP\nDestino: ELVIRIA - Hotel\nImporte a cobrar al cliente: 45,50', TODAY);
  assert.equal(r.date, '2027-03-07');
  assert.equal(r.passenger, 'Heidi Sachmann');
});

test('captura de otra app: etiqueta arriba y valor debajo, en inglés', () => {
  const ocr = `Booking ref
TRF-88213
Pick-up date
Fri, 20 Nov 2026
Pick-up time
14:45
Lead passenger
MR RICHARD SMITH
Flight number
FR 4250
From
Malaga Airport (AGP)
To
Hotel Don Pepe, Marbella
Passengers
3
Price
€ 95.00
Phone
+44 7700 900123`;
  assert.deepEqual(readService(ocr, TODAY), {
    date: '2026-11-20', time: '14:45', origin: 'Malaga Airport (AGP)', destination: 'Hotel Don Pepe, Marbella', amount: 95,
    notes: 'Ref. TRF-88213 · 3 pax', passenger: 'Mr Richard Smith', flight: 'FR4250', phone: '+44 7700 900123',
  });
});

test('mensaje corto sin etiquetas, con flecha', () => {
  const r = readService('Servicio mañana 08:30\nAeropuerto AGP → Nerja, Hotel Balcón de Europa\nPax: Ana López · VY1234 · 70€\nTel 0034 600 111 222', TODAY);
  assert.equal(r.date, '2026-11-20');
  assert.equal(r.time, '08:30');
  assert.equal(r.origin, 'Aeropuerto AGP');
  assert.equal(r.destination, 'Nerja, Hotel Balcón De Europa');
  assert.equal(r.amount, 70);
  assert.equal(r.flight, 'VY1234');
  assert.equal(r.phone, '0034 600 111 222');
});

test('fechas en muchos formatos', () => {
  assert.equal(findDate('20/11/2026', TODAY), '2026-11-20');
  assert.equal(findDate('3 de enero', TODAY), '2027-01-03');
  assert.equal(findDate('Jan 5th, 2027', TODAY), '2027-01-05');
  assert.equal(findDate('2026-12-24', TODAY), '2026-12-24');
  assert.equal(findDate('21.11.26', TODAY), '2026-11-21');
});

test('si no hay ni fecha ni hora, no es un servicio', () => {
  assert.equal(readService('Hola qué tal', TODAY), null);
});
