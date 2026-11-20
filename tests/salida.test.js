import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trafficFactor } from '../js/ruta.js';
import { isAirportPickup, leaveLine, leavePlan } from '../js/salida.js';

const srv = { id: 'a', f: '2026-11-20', h: '15:00', o: 'Aeropuerto de Málaga T3', d: 'Marbella', vu: 'FR4250', pa: 'Richard' };
const T = (hm) => new Date('2026-11-20T' + hm + ':00').getTime();
const flight = (arr) => ({ found: true, arr: { sched: new Date(T('15:00')).toISOString(), revised: new Date(T(arr)).toISOString() } });

test('recogida en el aeropuerto: sale según el aterrizaje real y el camino', () => {
  // Aterriza 15:30 (+30), estar 10 min después → 15:40; camino 20 min a las ~15:20 (viernes mediodía ×1,25 → 25) + 7 aparcar + 5 colchón
  const p = leavePlan(srv, flight('15:30'), { min: 20, km: 18 }, {}, T('12:00'));
  assert.equal(isAirportPickup(srv), true);
  assert.equal(p.delay, 30);
  assert.equal(p.travel, 32);
  assert.equal(new Date(p.leave).toTimeString().slice(0, 5), '15:03');
  assert.equal(p.off, -27); // 27 min antes de aterrizar
});

test('si el vuelo se retrasa, la salida se mueve igual', () => {
  const a = leavePlan(srv, flight('15:30'), { min: 20, km: 18 }, {}, T('12:00'));
  const b = leavePlan(srv, flight('16:10'), { min: 20, km: 18 }, {}, T('12:00'));
  assert.ok(Math.abs(b.leave - a.leave - 40 * 6e4) <= 3 * 6e4);
});

test('sin vuelo ni posición: hora del servicio y camino por defecto', () => {
  const s = { id: 'b', f: '2026-11-20', h: '10:00', o: 'Hotel Fuerte Marbella', d: 'Aeropuerto' };
  const p = leavePlan(s, null, null, { salDef: 30 }, T('08:00'));
  assert.equal(p.guess, true);
  assert.equal(new Date(p.leave).toTimeString().slice(0, 5), '09:20'); // 10:00 − 5 antes − 30 camino − 5 colchón
  assert.match(leaveLine(p, T('08:00')), /Sal a las 09:20 \(en 1 h 20 min\)/);
  assert.match(leaveLine(p, T('09:21')), /Sal ya/);
});

test('tráfico: hora punta laborable más lenta que la noche', () => {
  assert.ok(trafficFactor(new Date('2026-11-18T08:15:00')) > trafficFactor(new Date('2026-11-18T23:30:00')));
});
