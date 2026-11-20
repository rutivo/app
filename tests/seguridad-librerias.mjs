// Vigilante de librerías: busca avisos de seguridad publicados (npm audit) para
// TODAS las librerías externas que usa la app, con la versión exacta que lleva.
// Las versiones se leen del propio código (vendor/ y las direcciones de CDN), así
// que al actualizar una librería no hay que tocar este archivo.
// Falla si hay avisos «high» o «critical». Uso: node tests/seguridad-librerias.mjs
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.env.RUTIVO_ROOT || new URL('..', import.meta.url).pathname; // RUTIVO_ROOT: solo para probar el vigilante
const read = (f) => readFileSync(join(root, f), 'utf8');
const deps = {};
const add = (name, version, where) => { if (version) deps[name] = { version, where }; };

// Archivos dentro de la app (vendor/)
for (const f of readdirSync(join(root, 'vendor'))) {
  let m;
  if ((m = f.match(/^pdfjs-(\d+\.\d+\.\d+)$/))) add('pdfjs-dist', m[1], 'vendor/' + f);
  if ((m = f.match(/^jspdf-(\d+\.\d+\.\d+)/))) add('jspdf', m[1], 'vendor/' + f);
  if ((m = f.match(/^html2canvas-(\d+\.\d+\.\d+)/))) add('html2canvas', m[1], 'vendor/' + f);
  if ((m = f.match(/^leaflet-(\d+\.\d+\.\d+)\.js$/))) add('leaflet', m[1], 'vendor/' + f);
}
// Librerías que se descargan de un CDN (versión fija en el código)
const grab = (file, re, name) => { const m = read(file).match(re); add(name, m && m[1], file); };
grab('js/config.js', /firebasejs\/(\d+\.\d+\.\d+)/, 'firebase');
grab('js/ocr.js', /tesseract\.js@(\d+\.\d+\.\d+)/, 'tesseract.js');
grab('js/oidoWorker.js', /@huggingface\/transformers@(\d+\.\d+\.\d+)/, '@huggingface/transformers');

console.log('Librerías revisadas:');
for (const [n, d] of Object.entries(deps)) console.log('  ' + n + '@' + d.version + '  (' + d.where + ')');

const dir = mkdtempSync(join(tmpdir(), 'rutivo-audit-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'rutivo-audit', private: true, dependencies: Object.fromEntries(Object.entries(deps).map(([n, d]) => [n, d.version])) }));
execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', { cwd: dir, stdio: 'ignore' });
let report;
try {
  report = JSON.parse(execSync('npm audit --omit=dev --json', { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch (e) {
  report = JSON.parse(e.stdout); // npm audit sale con error si encuentra algo
}
// Solo hace fallar lo que llega al navegador: los avisos de las PROPIAS librerías
// (la app usa sus versiones ya compiladas para navegador). Los avisos de piezas que
// esas librerías solo usan en un servidor con Node (gRPC, undici, sharp, tar…) no
// llegan a la app: se listan aparte, solo como información.
let bad = 0;
const info = new Set();
for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
  const direct = name in deps;
  for (const via of v.via) {
    if (typeof via !== 'object') continue;
    if (!direct) { info.add(name); continue; }
    const grave = via.severity === 'high' || via.severity === 'critical';
    if (grave) bad++;
    console.log((grave ? 'FALLO' : 'aviso') + ' · ' + name + ' · ' + via.severity + ' · ' + via.title + ' · afecta a ' + via.range + ' · ' + via.url);
  }
}
if (info.size) console.log('Informativo (solo en servidor Node, no llega a la app): ' + [...info].join(', '));
console.log(bad ? bad + ' avisos graves (high/critical): hay que actualizar.' : 'Sin avisos graves en las librerías de la app ✓');
process.exit(bad ? 1 : 0);
