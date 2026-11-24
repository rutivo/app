import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, currentVersion, fingerprint, swFiles } from '../scripts/version-sw.mjs';

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('la versión de sw.js corresponde a los archivos actuales (si falla: npm run version)', () => {
  assert.equal(currentVersion(), fingerprint());
});

test('todos los archivos de la app están en la lista de sw.js (abre sin conexión)', () => {
  const listed = new Set(swFiles());
  const own = [...walk(join(ROOT, 'js')), ...walk(join(ROOT, 'css')), ...walk(join(ROOT, 'fonts'))].map((f) => './' + relative(ROOT, f).replaceAll('\\', '/'));
  const missing = own.filter((f) => !listed.has(f));
  assert.deepEqual(missing, []);
});

test('todo lo que está en la lista existe', () => {
  for (const f of swFiles()) if (f !== './') assert.ok(existsSync(join(ROOT, f)), f);
});
