import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kmOf, kmSummary, mapsUrl, perKm, serviceTime, timeUntil, upcoming, whenLabel } from '../js/trips.js';

const at = (f, h) => ({ f, h });

test('upcoming devuelve los servicios de las próximas horas, ordenados', () => {
  const now = new Date('2026-11-19T08:00:00').getTime();
  const list = [at('2026-11-19', '19:30'), at('2026-11-19', '07:00'), at('2026-11-19', '10:15'), at('2026-11-20', '09:00')];
  assert.deepEqual(upcoming(list, now, 12).map((s) => s.h), ['10:15', '19:30']);
});

test('km y €/km de un servicio', () => {
  assert.equal(kmOf({ ki: 120500, kf: 120623 }), 123);
  assert.equal(perKm({ ki: 1000, kf: 1100, i: 235 }), 2.35);
  assert.equal(kmOf({ ki: 100 }), null);
  assert.equal(kmOf({ ki: 200, kf: 100 }), null);
  assert.equal(perKm({ i: 50 }), null);
});

test('resumen de km del mes', () => {
  const s = kmSummary([{ ki: 0, kf: 100, i: 200 }, { ki: 0, kf: 50, i: 100 }, { i: 999 }]);
  assert.deepEqual(s, { count: 2, km: 150, money: 300, perKm: 2 });
});

test('enlace de Google Maps', () => {
  assert.equal(mapsUrl('Aeropuerto de Málaga'), 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=Aeropuerto%20de%20M%C3%A1laga');
});

test('etiquetas de cuándo es el servicio', () => {
  const now = new Date('2026-11-19T08:00:00').getTime();
  assert.equal(whenLabel(at('2026-11-19', '09:15'), now), 'Hoy 09:15');
  assert.equal(whenLabel(at('2026-11-20', '18:40'), now), 'Mañana 18:40');
  assert.equal(whenLabel(at('2026-11-26', '11:45'), now), 'Jue 26/11 11:45');
  assert.equal(timeUntil(at('2026-11-19', '11:20'), now), 'en 3 h 20 min');
  assert.equal(timeUntil(at('2026-11-19', '08:45'), now), 'en 45 min');
  assert.equal(serviceTime(at('2026-11-19', '')), new Date('2026-11-19T00:00:00').getTime());
});
