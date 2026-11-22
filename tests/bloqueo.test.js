// Bloqueo con PIN: el PIN no se guarda, solo vale el correcto y los intentos fallidos se frenan.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
const { checkPin, disableLock, enableLock, lockEnabled, lockSettings, pinHash, validPin, waitAfter } = await import('../js/bloqueo.js');

test('el PIN no se guarda: solo una huella con sal aleatoria', async () => {
  await enableLock('4821', 5);
  const s = lockSettings();
  const saved = JSON.stringify(s);
  assert.ok(!saved.includes('4821'), 'el PIN no aparece en lo guardado');
  assert.equal(s.mins, 5);
  assert.equal(s.len, 4);
  assert.ok(s.iter >= 100000);
  assert.equal(s.hash, await pinHash('4821', s.salt, s.iter));
  await enableLock('4821', 5);
  assert.notEqual(lockSettings().salt, s.salt, 'cada vez otra sal: la misma huella no se repite');
  assert.notEqual(lockSettings().hash, s.hash);
});

test('solo vale el PIN correcto; 4 a 6 cifras', async () => {
  assert.deepEqual(['123', '1234', '123456', '1234567', '12a4', ''].map(validPin), [false, true, true, false, false, false]);
  await enableLock('905173', 1);
  assert.equal((await checkPin('905173')).ok, true);
  assert.equal((await checkPin('905174')).ok, false);
  assert.equal((await checkPin('0000')).ok, false);
  await assert.rejects(() => enableLock('12'), /pin/);
});

test('intentos fallidos: a partir del 5.º hay que esperar, cada vez más; el acierto lo pone a cero', async () => {
  assert.deepEqual([1, 4, 5, 6, 7, 20].map(waitAfter), [0, 0, 30e3, 60e3, 120e3, 15 * 60e3]);
  await enableLock('2468', 1);
  let r;
  for (let i = 0; i < 4; i++) r = await checkPin('1111');
  assert.equal(r.left, 1);
  r = await checkPin('1111');
  assert.equal(r.wait, 30e3);
  const blocked = await checkPin('2468');
  assert.ok(!blocked.ok && blocked.wait > 0, 'durante la espera ni el PIN bueno vale');
  const f = JSON.parse(localStorage.getItem('bloqueoFallos')); f.until = Date.now() - 1; localStorage.setItem('bloqueoFallos', JSON.stringify(f));
  assert.equal((await checkPin('2468')).ok, true);
  assert.equal(localStorage.getItem('bloqueoFallos'), null);
});

test('quitar el bloqueo y que se quite al cerrar sesión (borrado del móvil)', async () => {
  await enableLock('1357', 0);
  assert.equal(lockEnabled(), true);
  disableLock();
  assert.equal(lockEnabled(), false);
  const src = (await import('node:fs')).readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  assert.match(src, /k === 'bloqueo' \|\| k === 'bloqueoFallos'/);
});
