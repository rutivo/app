import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanAlarms, nextEvent, step } from '../worker/avisos.js';
import { validSubscription } from '../worker/push.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const base = (over = {}) => cleanAlarms([{ id: 'sal-1', at: NOW + 3 * 36e5, title: '🚗 ¡Sal ya!', body: 'FR4250', pre: 15, fl: { n: 'FR4250', d: '2026-11-20', off: -25, who: 'Richard' }, ...over }], NOW)[0];

test('limpia lo que manda la app', () => {
  assert.equal(cleanAlarms([{ id: 'x', at: NOW + 5 * 864e5, title: 't' }], NOW).length, 0); // muy lejos
  assert.equal(cleanAlarms([{ id: '', at: NOW + 1e5, title: 't' }], NOW).length, 0);
  assert.equal(base().fl.n, 'FR4250');
  assert.equal(cleanAlarms([{ id: 'x', at: NOW + 1e5, title: 't', fl: { n: 'mal formado', d: '2026-11-20', off: 0 } }], NOW)[0].fl, undefined);
});

test('orden: revisar vuelo (90 y 35 min antes), «sal en 15», «sal ya»', () => {
  const a = base();
  assert.equal(nextEvent(a), a.at - 90 * 6e4);
});

test('si el vuelo se retrasa, mueve la salida y avisa', async () => {
  const a = base();
  const arr = a.at + 25 * 6e4 + 40 * 6e4; // aterriza 40 min más tarde de lo previsto
  const msgs = await step(a, a.at - 90 * 6e4, async () => ({ found: true, status: 'Expected', arr: { revised: new Date(arr).toISOString() } }), 'UTC');
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].title, /se retrasa/);
  assert.equal(a.at, arr - 25 * 6e4);
  assert.equal(nextEvent(a), a.at - 35 * 6e4);
});

test('cancelado: avisa y no manda el «sal ya»', async () => {
  const a = base();
  const msgs = await step(a, a.at - 90 * 6e4, async () => ({ found: true, status: 'Canceled' }), 'UTC');
  assert.match(msgs[0].title, /cancelado/);
  assert.equal(nextEvent(a), null);
});

test('«sal en 15 min» y luego «sal ya»', async () => {
  const a = base({ fl: undefined });
  let m = await step(a, a.at - 15 * 6e4, null, 'UTC');
  assert.match(m[0].title, /Sal en 15 min/);
  m = await step(a, a.at, null, 'UTC');
  assert.equal(m[0].title, '🚗 ¡Sal ya!');
  assert.equal(nextEvent(a), null);
});

test('solo se envía a servicios de notificaciones reales', () => {
  const keys = { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) };
  assert.equal(validSubscription({ endpoint: 'https://web.push.apple.com/abc', keys }), true);
  assert.equal(validSubscription({ endpoint: 'https://evil.example.com/x', keys }), false);
  assert.equal(validSubscription({ endpoint: 'http://fcm.googleapis.com/x', keys }), false);
});
