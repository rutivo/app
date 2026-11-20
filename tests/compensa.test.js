import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costSettings, worth } from '../js/compensa.js';
import { worthIntent } from '../js/asistente.js';

test('cuentas del servicio: gasoil, desgaste, comisión y por hora', () => {
  const st = costSettings({}, []);
  const r = worth({ price: 60, km: 55, min: 40, empty: true, waitMin: 20, commission: 10 }, st, 20);
  assert.equal(r.km, 110);
  assert.equal(r.commission, 6);
  assert.equal(r.fuel, 10.37); // 110 km · 6,5 L/100 · 1,45
  assert.equal(r.wear, 6.6);
  assert.equal(r.net, 37.03);
  assert.equal(r.hours, 1.67);
  assert.equal(r.verdict, 'si');
});

test('un servicio barato y largo no compensa y dice el precio mínimo', () => {
  const r = worth({ price: 35, km: 60, min: 50, empty: true }, costSettings({}, []), 22);
  assert.equal(r.verdict, 'no');
  assert.ok(r.minPrice > 35);
});

test('el precio del gasoil sale de los tickets', () => {
  const st = costSettings({}, [{ i: 60, l: 40 }, { i: 70, l: 50 }]);
  assert.equal(st.fuelPrice, 1.45);
  assert.equal(st.fuelFromTickets, true);
});

test('el asistente entiende «¿me compensa?»', () => {
  const r = worthIntent('me compensa un servicio de 60 euros del aeropuerto a marbella');
  assert.deepEqual([r.kind, r.price, r.from, r.to], ['worth', 60, 'Aeropuerto de Málaga', 'marbella']);
  assert.equal(worthIntent('cuanto llevo hoy'), null);
});
