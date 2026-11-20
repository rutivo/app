// Calcula la huella de la versión (todos los archivos de FILES en sw.js) y la
// escribe en sw.js. Uso: npm run version   ·   --check: solo comprueba.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'sw.js');

export function swFiles(src = readFileSync(SW, 'utf8')) {
  const list = src.match(/const FILES = \[([\s\S]*?)\];/)[1];
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

export function fingerprint(files = swFiles()) {
  const h = createHash('sha256');
  for (const f of [...files].sort()) {
    const path = f === './' ? 'index.html' : f.replace(/^\.\//, '');
    h.update(f + '\0');
    h.update(readFileSync(join(ROOT, path)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

export const currentVersion = (src = readFileSync(SW, 'utf8')) => (src.match(/const VERSION = '([^']*)';/) || [])[1];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = readFileSync(SW, 'utf8');
  const want = fingerprint(swFiles(src));
  if (process.argv.includes('--check')) {
    console.log(currentVersion(src) === want ? 'Versión al día: ' + want : 'Falta actualizar la versión: npm run version');
    process.exit(currentVersion(src) === want ? 0 : 1);
  }
  writeFileSync(SW, src.replace(/const VERSION = '[^']*';/, "const VERSION = '" + want + "';"));
  console.log('Versión: ' + want);
}
