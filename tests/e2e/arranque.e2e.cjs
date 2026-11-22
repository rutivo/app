// Arranque rápido y actualizaciones (sw.js «primero lo guardado» + js/actualizar.js).
// Simula un móvil con cobertura normal (cada petición tarda RTT ms), sin
// cobertura y con cobertura «fantasma» (el servidor no contesta nunca).
// Uso: node tests/e2e/arranque.e2e.cjs
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const REPO = path.resolve(__dirname, '..', '..');
const RTT = 300;
const CONFIG = "export const FIREBASE_CONFIG=null;export const TRIAL_ENABLED=false;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';";
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };

/** Copia de la app (lo que se publica) en una carpeta temporal. */
function copyApp(dest, from = REPO) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ['index.html', 'legal.html', 'cliente.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'sw.js', '.nojekyll']) if (fs.existsSync(path.join(from, f))) fs.copyFileSync(path.join(from, f), path.join(dest, f));
  for (const d of ['js', 'css', 'fonts', 'scripts']) if (fs.existsSync(path.join(from, d))) fs.cpSync(path.join(from, d), path.join(dest, d), { recursive: true });
  // Sin nube ni servicios externos (y la huella recalculada con este config.js)
  fs.writeFileSync(path.join(dest, 'js', 'config.js'), CONFIG);
  if (fs.existsSync(path.join(dest, 'scripts', 'version-sw.mjs'))) execFileSync('node', [path.join(dest, 'scripts', 'version-sw.mjs')]);
  return dest;
}
/** Versión nueva: cambia el título y recalcula la huella. */
function newerVersion(dir, title) {
  const p = path.join(dir, 'index.html');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/<title>[^<]*<\/title>/, '<title>' + title + '</title>'));
  execFileSync('node', [path.join(dir, 'scripts', 'version-sw.mjs')]);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rutivo-arranque-'));
  // Versión publicada antes de este cambio (red primero), para probar el salto
  let oldDir = null;
  try {
    oldDir = path.join(tmp, 'publicada');
    execFileSync('git', ['-C', REPO, 'worktree', 'add', '--detach', '-q', oldDir, 'd37db23']);
    fs.writeFileSync(path.join(oldDir, 'js', 'config.js'), CONFIG);
  } catch { oldDir = null; }
  const v1 = copyApp(path.join(tmp, 'v1'));
  const v2 = copyApp(path.join(tmp, 'v2')); newerVersion(v2, 'Rutivo v2');
  const v3 = copyApp(path.join(tmp, 'v3')); newerVersion(v3, 'Rutivo v3');

  let root = v1; let mode = 'ok'; let hits = 0; let stale = null; // stale: {file, from}: un archivo de otra versión (publicación a medias)
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits++;
    if (mode === 'down') return req.socket.destroy();
    if (mode === 'hang') return; // nunca contesta
    setTimeout(() => {
      let base = root;
      if (stale && u.pathname === '/' + stale.file) base = stale.from;
      let f = path.join(base, decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
      fs.createReadStream(f).pipe(res);
    }, RTT);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 400, height: 860 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const DATA = { mov: [{ id: 'm1', f: '2026-11-20', t: 'in', p: 'efectivo', i: 55, c: 'Carrera' }], srv: [], gas: [], huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };
  await page.addInitScript((d) => {
    if (location.protocol === 'about:' || localStorage.getItem('cajaTransfer')) return;
    for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0'], ['cajaTransfer', JSON.stringify(d)]]) localStorage.setItem(k, v);
  }, DATA);
  const appReady = () => page.waitForFunction(() => document.querySelector('.tabs button') && /55/.test(document.body.innerText), null, { timeout: 30000 });
  const open = async () => {
    hits = 0;
    const t = Date.now();
    await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    await appReady();
    return { ms: Date.now() - t, hits };
  };
  const swReady = () => page.waitForFunction(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated', null, { timeout: 30000 });
  const caches_ = () => page.evaluate(() => caches.keys());
  /** Pide buscar versión nueva y espera a que la instalación termine (bien o mal). */
  const updateAndSettle = () => page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update().catch(() => {});
    for (let i = 0; i < 300 && reg.installing; i++) await new Promise((r) => setTimeout(r, 100));
  });

  try {
    // ---------- 0. Salto desde la versión publicada (red primero) ----------
    if (oldDir) {
      root = oldDir;
      await open(); await swReady();
      const before = await caches_();
      root = v1;
      await page.reload({ waitUntil: 'commit' });
      // La versión nueva se descarga por detrás (≈60 archivos con cobertura lenta: varios segundos)
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(500);
        const k = await caches_().catch(() => []); // puede coincidir con la recarga
        if (k.length === 1 && k[0].startsWith('rutivo-')) break;
      }
      await page.waitForLoadState('load').catch(() => {});
      const after = await caches_();
      ok('0 · desde la versión publicada: se instala la nueva y se borra la caché antigua', before.some((k) => k.startsWith('gestor-transfer-')) && after.length === 1 && after[0].startsWith('rutivo-'), before.join(',') + ' → ' + after.join(','));
    } else {
      await open(); await swReady();
    }
    await page.waitForTimeout(1500);

    // ---------- 1. Abrir con cobertura normal ----------
    const a = await open();
    const b = await open();
    ok('1 · abre desde lo guardado: casi sin peticiones a internet', b.hits <= 2, a.hits + ' y ' + b.hits + ' peticiones (antes: ~72)');
    ok('2 · abre rápido con cobertura normal', b.ms < 1500, a.ms + ' ms y ' + b.ms + ' ms (antes: ~3.700 ms)');

    // ---------- 2. Sin cobertura y con cobertura «fantasma» ----------
    mode = 'down';
    const c = await open();
    ok('3 · sin cobertura: abre igual, con los datos', c.ms < 1500, c.ms + ' ms');
    mode = 'hang';
    const d = await open();
    ok('4 · cobertura «fantasma» (internet no contesta): abre igual, sin esperar', d.ms < 1500, d.ms + ' ms');
    mode = 'ok';
    await page.goto('about:blank'); // corta las peticiones colgadas
    await open();

    // ---------- 3. Versión nueva, al abrir: se aplica sola ----------
    // El reconocedor de voz (Whisper) guarda su modelo en su propia caché: no debe borrarse al actualizar
    await page.evaluate(async () => { const c = await caches.open('transformers-cache'); await c.put('/modelo-prueba', new Response('x'.repeat(1000))); });
    root = v2;
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.title === 'Rutivo v2', null, { timeout: 30000 }).catch(() => {});
    ok('5 · versión nueva publicada: al abrir se aplica sola (se recarga una vez)', (await page.title()) === 'Rutivo v2', await page.title());
    await appReady();
    ok('6 · los datos siguen ahí tras actualizar', /55/.test(await page.evaluate(() => document.body.innerText)) && JSON.parse(await page.evaluate(() => localStorage.getItem('cajaTransfer'))).mov.length === 1);
    const k7 = await caches_();
    ok('7 · de la app solo queda la versión actual', k7.filter((k) => k.startsWith('rutivo-') || k.startsWith('gestor-transfer-')).length === 1, k7.join(','));
    ok('7b · el reconocedor de voz NO se borra al actualizar (antes había que bajar 77 MB otra vez)', k7.includes('transformers-cache') && !!(await page.evaluate(async () => (await caches.open('transformers-cache')).match('/modelo-prueba'))));

    // ---------- 4. Versión publicada a medias: no se instala ----------
    await page.waitForTimeout(13000); // ya no está «recién abierta»
    root = v3; stale = { file: 'js/dom.js', from: v1 }; // dom.js de otra versión (no coincide la huella)
    // Para que la huella falle de verdad, dom.js de v3 debe ser distinto del de v1
    fs.appendFileSync(path.join(v3, 'js', 'dom.js'), '\n// v3\n'); execFileSync('node', [path.join(v3, 'scripts', 'version-sw.mjs')]);
    await updateAndSettle();
    await page.waitForTimeout(500);
    const keysHalf = (await caches_()).filter((k) => k.startsWith('rutivo-'));
    ok('8 · publicación a medias (un archivo de otra versión): NO se instala, sigue la anterior', (await page.title()) === 'Rutivo v2' && keysHalf.length === 1 && !(await page.$('#upd')), keysHalf.join(','));

    // ---------- 5. Ya completa, con la app en uso: aviso, sin cortar ----------
    stale = null;
    await page.click('.tabs button[data-v="ga"]').catch(() => {});
    await updateAndSettle();
    await page.waitForSelector('#upd', { timeout: 20000 }).catch(() => {});
    ok('9 · con la app en uso: no se recarga sola, sale «Nueva versión · Actualizar»', (await page.title()) === 'Rutivo v2' && !!(await page.$('#upd')));
    await Promise.all([page.waitForNavigation({ timeout: 20000 }), page.click('#upd')]);
    await appReady();
    ok('10 · al tocar «Actualizar» se carga la versión nueva', (await page.title()) === 'Rutivo v3');

    // ---------- 6. Tras actualizar, sigue abriendo rápido y sin conexión ----------
    const e = await open();
    mode = 'down';
    const f = await open();
    mode = 'ok';
    ok('11 · la versión nueva también abre rápido y sin conexión', e.ms < 1500 && f.ms < 1500 && (await page.title()) === 'Rutivo v3', e.ms + ' ms · sin conexión ' + f.ms + ' ms');
    ok('12 · sin errores', !errs.length, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
    if (oldDir) try { execFileSync('git', ['-C', REPO, 'worktree', 'remove', '--force', oldDir]); } catch { /* nada */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
