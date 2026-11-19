import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalDelay, arrivalTime, changeNotice, delayLabel, hasLanded, statusLabel } from '../js/flightStatus.js';

const flight = (arr, status = 'EnRoute') => ({ found: true, status, arr: { sched: '2026-11-19T14:15:00Z', ...arr } });

test('hora estimada: real > revisada > prevista > programada', () => {
  assert.equal(arrivalTime(flight({})), Date.parse('2026-11-19T14:15:00Z'));
  assert.equal(arrivalTime(flight({ predicted: '2026-11-19T14:40:00Z' })), Date.parse('2026-11-19T14:40:00Z'));
  assert.equal(arrivalTime(flight({ predicted: '2026-11-19T14:40:00Z', revised: '2026-11-19T14:35:00Z' })), Date.parse('2026-11-19T14:35:00Z'));
  assert.equal(arrivalTime(flight({ revised: '2026-11-19T14:35:00Z', runway: '2026-11-19T14:31:00Z' })), Date.parse('2026-11-19T14:31:00Z'));
});

test('retraso en minutos y etiqueta', () => {
  assert.equal(arrivalDelay(flight({ predicted: '2026-11-19T14:40:00Z' })), 25);
  assert.equal(delayLabel(25), '+25 min');
  assert.equal(delayLabel(-7), '-7 min');
  assert.equal(delayLabel(3), 'puntual');
  assert.equal(statusLabel('EnRoute'), 'En vuelo');
  assert.equal(hasLanded(flight({ runway: '2026-11-19T14:31:00Z' })), true);
});

test('aviso cuando se retrasa 10 min o más', () => {
  const a = flight({ predicted: '2026-11-19T14:20:00Z' });
  const b = flight({ predicted: '2026-11-19T14:45:00Z' });
  const n = changeNotice(a, b, 'FR4250');
  assert.equal(n.kind, 'delay');
  assert.match(n.text, /se ha retrasado 25 min/);
  assert.match(n.text, /\(\+30 min sobre su hora\)/);
});

test('sin aviso por cambios pequeños ni en la primera consulta', () => {
  assert.equal(changeNotice(flight({ predicted: '2026-11-19T14:20:00Z' }), flight({ predicted: '2026-11-19T14:25:00Z' }), 'X'), null);
  assert.equal(changeNotice(null, flight({ predicted: '2026-11-19T15:20:00Z' }), 'X'), null);
});

test('aviso de adelanto y de cancelación', () => {
  assert.equal(changeNotice(flight({ predicted: '2026-11-19T14:45:00Z' }), flight({ predicted: '2026-11-19T14:20:00Z' }), 'X').kind, 'early');
  assert.equal(changeNotice(flight({}), flight({}, 'Canceled'), 'FR1').kind, 'cancel');
  assert.equal(changeNotice(flight({}, 'Canceled'), flight({}, 'Canceled'), 'FR1'), null);
});

test('el seguimiento empieza a la hora de despegue y acaba al aterrizar', async () => {
  const { shouldTrack, isAirborne } = await import('../js/flightStatus.js');
  const f = { found: true, status: 'Expected', dep: { sched: '2026-11-19T11:20:00Z', revised: '2026-11-19T11:50:00Z' }, arr: { sched: '2026-11-19T14:15:00Z' } };
  assert.equal(shouldTrack(null, 0), true);
  assert.equal(shouldTrack(f, Date.parse('2026-11-19T11:30:00Z')), false); // retrasado: aún no despega
  assert.equal(shouldTrack(f, Date.parse('2026-11-19T11:50:00Z')), true);
  assert.equal(isAirborne(f), false);
  const flying = { ...f, status: 'EnRoute', dep: { ...f.dep, runway: '2026-11-19T11:55:00Z' } };
  assert.equal(isAirborne(flying), true);
  const landed = { ...flying, status: 'Arrived', arr: { ...f.arr, runway: '2026-11-19T14:20:00Z' } };
  assert.equal(isAirborne(landed), false);
  assert.equal(shouldTrack(landed, Date.parse('2026-11-19T15:00:00Z')), false);
  assert.equal(shouldTrack({ found: false }, 0), false);
  // En el aire: cada 15 min, y cada 5 en la última media hora
  const t0 = Date.parse('2026-11-19T12:30:00Z');
  const seen = { ...flying, at: t0 };
  assert.equal(shouldTrack(seen, t0 + 10 * 6e4), false);
  assert.equal(shouldTrack(seen, t0 + 15 * 6e4), true);
  const near = { ...flying, at: Date.parse('2026-11-19T14:00:00Z') };
  assert.equal(shouldTrack(near, Date.parse('2026-11-19T14:05:00Z')), true);
  assert.equal(shouldTrack({ found: false, at: t0 }, t0 + 7 * 36e5), true);
});
