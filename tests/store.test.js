import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeState } from '../js/store.js';
test('una copia manipulada no cuela claves peligrosas ni tipos raros', () => {
  const evil = JSON.parse('{"mov":[{"id":"a","i":5,"__proto__":{"admin":true}}],"srv":"no es lista","cfg":{"nom":"X","constructor":{"prototype":{"x":1}}},"fac":[1,"x",{"id":"f"}],"raro":1}');
  const s = sanitizeState(evil);
  assert.equal(s.mov.length, 1);
  assert.equal(Object.getPrototypeOf(s.mov[0]), Object.prototype);
  assert.equal(s.mov[0].admin, undefined);
  assert.deepEqual(s.srv, []);
  assert.equal(s.cfg.nom, 'X');
  assert.equal(Object.hasOwn(s.cfg, 'constructor'), false);
  assert.deepEqual(s.fac, [{ id: 'f' }]);
  assert.equal(s.raro, undefined);
  assert.equal({}.admin, undefined);
});
