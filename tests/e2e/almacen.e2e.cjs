// Fase 2 · Tarea 2: fotos de tickets y base de sincronización en el almacén
// grande del móvil (IndexedDB), con paso seguro de los datos que ya había.
// Uso: node tests/e2e/almacen.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, device, serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };

// «Fotos» de prueba: JPEG reales de distinto color (para saber cuál es cuál)
const jpeg = (page, color, size = 600) => page.evaluate(([color, size]) => {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) { g.fillStyle = 'hsl(' + (i * 37) % 360 + ',60%,50%)'; g.fillRect((i * 53) % size, (i * 97) % size, 20, 20); }
  return c.toDataURL('image/jpeg', 0.9);
}, [color, size]);

const state = (gas) => ({ mov: gas.map((g) => ({ id: g.mid, f: g.f, t: 'out', p: 'tarjeta', i: g.i, c: 'Gasolina' })), srv: [], gas, huc: [], fac: [], prv: [], jor: [], cli: {},
  cfg: { nom: 'Antonio Ruiz', iva: 10, legal: { v: 1, at: '2026-11-20' } } });
const G = (n, ph = 1) => ({ id: 'g' + n, mid: 'g' + n + 'm', f: '2026-11-0' + n, i: 40 + n, l: 30, p: 'tarjeta', s: 'Repsol', ph });

// Lectura directa del almacén grande, desde la página
const idb = (page, store) => page.evaluate((store) => new Promise((resolve) => {
  const r = indexedDB.open('rutivo');
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains(store)) return resolve({});
    const out = {}; const tx = db.transaction(store); const s = tx.objectStore(store);
    s.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } };
    tx.oncomplete = () => { db.close(); resolve(out); };
  };
  r.onerror = () => resolve(null);
}), store);
const lsPhotos = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('foto_')).map((k) => [k.slice(5), localStorage.getItem(k)])));
const showReceipt = async (page, id) => {
  await page.evaluate(() => document.querySelector('.tabs button[data-v="ga"]').click());
  await page.waitForTimeout(300);
  await page.evaluate((id) => document.querySelector('[data-ph="' + id + '"]').click(), id);
  await page.waitForTimeout(500);
  const src = await page.evaluate(() => document.querySelector('#phi').src);
  await page.evaluate(() => document.querySelector('#phx').click());
  return src;
};

async function localApp(browser, app, { init = null, noIdb = false } = {}) {
  const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 400, height: 860 }, acceptDownloads: true });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
    if (u.hostname === '127.0.0.1') return r.continue();
    return r.abort();
  });
  if (noIdb) await ctx.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(app.url + 'legal.html'); // mismo origen, sin arrancar la app
  await page.evaluate((init) => {
    for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(init || {})) localStorage.setItem(k, v);
  }, init);
  return { ctx, page };
}
const open = async (page, app) => { await page.goto(app.url); await page.waitForTimeout(2600); }; // la migración arranca a los 1,5 s

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // ---------- 1. Móvil con fotos antiguas en localStorage ----------
    {
      const { ctx, page } = await localApp(browser, app);
      const fotos = { g1: await jpeg(page, '#c00'), g2: await jpeg(page, '#0a0'), g3: await jpeg(page, '#00c') };
      await page.evaluate(([st, fotos]) => {
        localStorage.setItem('cajaTransfer', JSON.stringify(st));
        for (const [id, v] of Object.entries(fotos)) localStorage.setItem('foto_' + id, v);
      }, [state([G(1), G(2), G(3)]), fotos]);
      const lsBytes = Object.values(fotos).reduce((a, v) => a + v.length, 0);

      await open(page, app); // 1.ª apertura con la versión nueva
      let inIdb = await idb(page, 'fotos');
      let inLs = await lsPhotos(page);
      ok('1 · 1.ª apertura: las 3 fotos se copian al almacén grande, idénticas', ['g1', 'g2', 'g3'].every((k) => inIdb[k] === fotos[k]), Object.keys(inIdb).join(','));
      ok('2 · 1.ª apertura: la copia antigua NO se borra todavía', ['g1', 'g2', 'g3'].every((k) => inLs[k] === fotos[k]));
      ok('3 · la foto se ve igual', (await showReceipt(page, 'g2')) === fotos.g2);

      await open(page, app); // 2.ª apertura enseguida: aún dentro de la hora de espera
      inLs = await lsPhotos(page);
      ok('4 · 2.ª apertura antes de 1 hora: sigue sin borrarse nada', Object.keys(inLs).length === 3);

      // Ha pasado más de 1 hora desde la copia
      await page.evaluate(() => localStorage.setItem('fotosIdb', String(Date.now() - 2 * 3600e3)));
      // Una foto con la copia nueva distinta (dañada): nunca se borra la antigua
      await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('rutivo'); r.onsuccess = () => { const tx = r.result.transaction('fotos', 'readwrite'); tx.objectStore('fotos').put('dañada', 'g3'); tx.oncomplete = () => { r.result.close(); ok(); }; }; }));
      await open(page, app);
      inIdb = await idb(page, 'fotos');
      inLs = await lsPhotos(page);
      ok('5 · pasada la hora: se libera la copia antigua de las fotos ya comprobadas', !('g1' in inLs) && !('g2' in inLs), Math.round((fotos.g1.length + fotos.g2.length) / 1024) + ' KB liberados');
      ok('6 · una foto cuya copia nueva no coincide: NO se borra y se vuelve a copiar bien', inLs.g3 === fotos.g3 && inIdb.g3 === fotos.g3);
      await open(page, app);
      inLs = await lsPhotos(page);
      ok('7 · y en la siguiente apertura, ya comprobada, se libera también', !Object.keys(inLs).length, 'localStorage ocupaba ' + Math.round(lsBytes / 1024) + ' KB en fotos; ahora 0');
      ok('8 · tras el paso, todas las fotos se siguen viendo', (await showReceipt(page, 'g1')) === fotos.g1 && (await showReceipt(page, 'g3')) === fotos.g3);

      // PDF de tickets: usa las fotos del almacén nuevo
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#gpdf')]);
      const pdf = require('fs').readFileSync(await d.path());
      const imgs = (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
      ok('9 · el PDF de tickets incluye las 3 fotos', imgs >= 3, imgs + ' imágenes');

      // Foto nueva: va directa al almacén grande
      await page.evaluate(() => document.querySelector('.tabs button[data-v="ga"]').click());
      const nueva = await jpeg(page, '#fa0');
      await page.setInputFiles('#gh', { name: 'ticket.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(nueva.split(',')[1], 'base64') });
      await page.waitForTimeout(1500);
      await page.fill('#gi', '33');
      await page.evaluate(() => document.querySelector('#fg').requestSubmit());
      await page.waitForTimeout(1200);
      inIdb = await idb(page, 'fotos');
      inLs = await lsPhotos(page);
      const newId = Object.keys(inIdb).find((k) => !['g1', 'g2', 'g3'].includes(k));
      ok('10 · una foto nueva se guarda en el almacén grande (no en localStorage)', !!newId && !Object.keys(inLs).length, newId);
      ok('11 · y se ve', !!newId && (await showReceipt(page, newId)).startsWith('data:image/jpeg'));

      // Borrar el ticket borra su foto
      await page.evaluate(() => document.querySelector('[data-dg="g2"]').click());
      await page.waitForTimeout(600);
      inIdb = await idb(page, 'fotos');
      ok('12 · al borrar un ticket se borra su foto del almacén', !('g2' in inIdb) && 'g1' in inIdb);

      // Restaurar copia: mantiene la marca de foto si la foto está aquí y la quita si no
      const copia = JSON.stringify(state([G(1), G(7)]));
      await page.evaluate(async (copia) => { const { importBackup } = await import('/js/store.js'); window.__r = await importBackup(copia); }, copia);
      const gas = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).gas.map((g) => g.id + ':' + (g.ph ? 'foto' : 'sin')));
      ok('13 · restaurar una copia: conserva la foto que hay y no promete la que no está', gas.join(',') === 'g1:foto,g7:sin', gas.join(','));

      // Cerrar sesión borra las fotos del móvil (como antes)
      await page.evaluate(async () => { (await import('/js/cloud.js')).disconnectAndWipe(); });
      await page.waitForTimeout(400);
      inIdb = await idb(page, 'fotos');
      ok('14 · al cerrar sesión se borran las fotos de este móvil (igual que antes)', !Object.keys(inIdb).length);
      ok('15 · sin errores', !page.errors.length, page.errors.join(' | '));
      await ctx.close();
    }

    // ---------- 2. Navegador sin almacén grande: todo sigue como antes ----------
    {
      const { ctx, page } = await localApp(browser, app, { noIdb: true });
      const foto = await jpeg(page, '#c00');
      await page.evaluate(([st, foto]) => { localStorage.setItem('cajaTransfer', JSON.stringify(st)); localStorage.setItem('foto_g1', foto); }, [state([G(1)]), foto]);
      await open(page, app);
      ok('16 · sin IndexedDB: la foto antigua sigue en su sitio y se ve', (await lsPhotos(page)).g1 === foto && (await showReceipt(page, 'g1')) === foto);
      const nueva = await jpeg(page, '#0a0');
      await page.evaluate(() => document.querySelector('.tabs button[data-v="ga"]').click());
      await page.setInputFiles('#gh', { name: 'ticket.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(nueva.split(',')[1], 'base64') });
      await page.waitForTimeout(1500);
      await page.fill('#gi', '20');
      await page.evaluate(() => document.querySelector('#fg').requestSubmit());
      await page.waitForTimeout(1000);
      ok('17 · sin IndexedDB: las fotos nuevas se guardan en localStorage como antes', Object.keys(await lsPhotos(page)).length === 2);
      ok('18 · sin errores', !page.errors.length, page.errors.join(' | '));
      await ctx.close();
    }

    // ---------- 3. Base de la sincronización ----------
    {
      const store = createFirestore();
      const local = state([G(1, 0)]);
      const A = await device(browser, app, store, { local, name: 'A' });
      await A.page.waitForTimeout(3000);
      const baseIdb = await idb(A.page, 'sync');
      const baseLs = await A.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('syncBase:')));
      ok('19 · la base de sincronización se guarda en el almacén grande, no en localStorage', !!baseIdb['syncBase:u1'] && !baseLs.length, Math.round((baseIdb['syncBase:u1'] || '').length / 1024) + ' KB');

      // Móvil con la base antigua en localStorage (versión anterior): se lee y se pasa
      const legacy = baseIdb['syncBase:u1'];
      await A.page.evaluate((b) => new Promise((ok) => { localStorage.setItem('syncBase:u1', b); const r = indexedDB.open('rutivo'); r.onsuccess = () => { const tx = r.result.transaction('sync', 'readwrite'); tx.objectStore('sync').clear(); tx.oncomplete = () => { r.result.close(); ok(); }; }; }), legacy);
      // Otro móvil borra un movimiento: con base, A también lo borra (sin base, lo recuperaría)
      const B = await device(browser, app, store, { local: null, name: 'B' });
      await B.page.waitForTimeout(3000);
      await B.page.evaluate(async () => { const { S, save } = await import('/js/store.js'); S.mov = []; S.gas = []; save(); });
      await B.page.waitForTimeout(3000);
      await A.page.reload();
      await A.page.waitForTimeout(3500);
      const movA = await A.page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).mov.length);
      const after = await idb(A.page, 'sync');
      const lsAfter = await A.page.evaluate(() => localStorage.getItem('syncBase:u1'));
      ok('20 · con la base antigua (localStorage) se sigue sincronizando bien: lo borrado en otro móvil se borra aquí', movA === 0, movA + ' movimientos');
      ok('21 · y la base pasa al almacén grande y se libera localStorage', !!after['syncBase:u1'] && lsAfter === null);
      ok('22 · sin errores', !A.page.errors.length && !B.page.errors.length, [...A.page.errors, ...B.page.errors].join(' | '));
      await A.ctx.close();
      await B.ctx.close();
    }
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
