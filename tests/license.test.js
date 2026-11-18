import assert from 'node:assert/strict';
import { test } from 'node:test';
import { licenseCode, trialDaysLeft } from '../js/license.js';

// Valores calculados con la versión original de la app: si cambian, las
// activaciones ya entregadas dejarían de funcionar.
test('el código de activación no cambia respecto a la versión original', () => {
  assert.equal(licenseCode('ABC123'), '1DKR8B');
  assert.equal(licenseCode(' abc123 '), '1DKR8B');
  assert.equal(licenseCode('ZZ9XQ1'), 'VY4HAH');
});

test('días de prueba restantes', () => {
  const start = Date.UTC(2026, 0, 1);
  assert.equal(trialDaysLeft(start, start), 15);
  assert.equal(trialDaysLeft(start, start + 14.5 * 864e5), 1);
  assert.equal(trialDaysLeft(start, start + 15 * 864e5), 0);
});
