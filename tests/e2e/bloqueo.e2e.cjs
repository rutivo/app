// Bloqueo con PIN: activar desde Cuenta, la app arranca bloqueada (sin enseñar
// nada), PIN incorrecto/correcto, bloqueo al salir de la app, Face ID / huella
// (autenticador virtual) y «He olvidado el PIN» (sale sin perder nada; sin
// internet con cambios pendientes, NO sale).
// Uso: node tests/e2e/bloqueo.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const STATE = { mov: [{ id: 'm1', f: TODAY, t: 'in', p: 'efectivo', i: 55, c: 'Carrera secreta' }], srv: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };

const locked = (page) => page.evaluate(() => !!document.querySelector('#lock') && document.body.classList.contains('locked'));
const typePin = async (page, pin) => { for (const d of pin) await page.click('#lock [data-lk="' + d + '"]'); await page.waitForTimeout(600); };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    const A = await device(browser, app, store, { local: STATE, name: 'A' });
    const page = A.page;
    await page.waitForTimeout(2500);

    // ---------- Activar ----------
    await page.click('#acctbtn');
    await page.waitForTimeout(500);
    await page.fill('#lknew', '4821');
    await page.fill('#lkrep', '4821');
    await page.click('#lkon');
    await page.waitForTimeout(800);
    ok('1 · en Cuenta → Seguridad se activa el bloqueo con un PIN', /Bloqueo activado/.test(await page.textContent('#lockc')));
    const saved = await page.evaluate(() => localStorage.getItem('bloqueo'));
    ok('2 · el PIN no se guarda en el móvil (solo su huella)', saved && !saved.includes('4821'));

    // ---------- Arranca bloqueada ----------
    await page.reload();
    await page.waitForTimeout(1500);
    ok('3 · al abrir la app, está bloqueada', await locked(page));
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.tabs, #v-hoy, #asisbtn')].every((e) => getComputedStyle(e).visibility === 'hidden'));
    const shown = await page.evaluate(() => document.body.innerText);
    ok('4 · no se ve nada de la app (ni tus apuntes) mientras está bloqueada', hidden && !/Carrera secreta|55,00/.test(shown), shown.slice(0, 60));

    await typePin(page, '1111');
    ok('5 · PIN incorrecto: sigue bloqueada y lo dice', (await locked(page)) && /PIN incorrecto/.test(await page.textContent('#lock .lk-msg')));
    await typePin(page, '4821');
    ok('6 · PIN correcto: se abre', !(await locked(page)) && /Carrera secreta/.test(await page.evaluate(() => document.body.innerText)));

    // ---------- PIN de 6 cifras: 6 huecos y se entra con las 6 ----------
    await page.evaluate(async () => { const m = await import('/js/bloqueo.js'); await m.enableLock('905173', 1); });
    await page.reload(); await page.waitForTimeout(1500);
    const huecos = await page.evaluate(() => document.querySelectorAll('#lock .lk-dots i').length);
    await typePin(page, '9051');
    const aMedias = await locked(page);
    await typePin(page, '73');
    ok('6b · con un PIN de 6 cifras salen 6 huecos (antes 4) y se entra al poner las 6', huecos === 6 && aMedias && !(await locked(page)), huecos + ' huecos');
    await page.evaluate(async () => { const m = await import('/js/bloqueo.js'); await m.enableLock('4821', 1); });

    // ---------- Al salir de la app ----------
    const hide = (v) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
    await hide('hidden'); await hide('visible');
    ok('7 · con «tras 1 min fuera», salir y volver enseguida no la bloquea', !(await locked(page)));
    await page.click('#acctbtn'); await page.waitForTimeout(400);
    await page.selectOption('#lkmin', '0');
    await page.dispatchEvent('#lkmin', 'change');
    await hide('hidden');
    ok('8 · con «al momento», en cuanto sales queda tapada (tampoco se ve en la multitarea)', await locked(page));
    await hide('visible');
    await typePin(page, '4821');

    // ---------- Olvidé el PIN, sin internet y con cambios sin subir: NO sale ----------
    await A.setOffline(true);
    await page.evaluate(async () => { const s = await import('/js/store.js'); s.S.mov.push({ id: 'nuevo', f: s.S.mov[0].f, t: 'in', p: 'tarjeta', i: 12, c: 'Sin subir' }); s.save(); (await import('/js/bloqueo.js')).lockNow(); });
    await page.waitForTimeout(400);
    await page.click('#lock [data-lk="forgot"]');
    await page.click('#lock [data-lkout]');
    await page.waitForTimeout(2500);
    const msg = await page.textContent('#lock .lk-msg');
    ok('9 · «He olvidado el PIN» sin internet y con cambios sin subir: no cierra sesión ni borra nada', (await locked(page)) && /sin subir/.test(msg) && /Sin subir/.test(await page.evaluate(() => localStorage.getItem('cajaTransfer'))), msg.slice(0, 70));

    // ---------- Con internet: sube lo pendiente, sale y el bloqueo se quita ----------
    await A.setOffline(false);
    await page.waitForTimeout(1500);
    await page.click('#lock [data-lkout]');
    await page.waitForTimeout(3000);
    const cloud = JSON.stringify(store.docsOf('u1'));
    const after = await page.evaluate(() => [!!document.querySelector('#lock'), localStorage.getItem('bloqueo'), localStorage.getItem('cajaOwner')]);
    ok('10 · con internet: sube lo pendiente a la cuenta antes de salir (nada se pierde)', /Sin subir/.test(cloud) && /Carrera secreta/.test(cloud));
    ok('11 · …cierra sesión y el bloqueo se quita (se entra con email y contraseña)', !after[0] && after[1] === null, JSON.stringify(after));
    ok('12 · sin errores', !page.errors.length, page.errors.join(' | '));
    await A.ctx.close();

    // ---------- Face ID / huella (autenticador virtual del navegador) ----------
    const ctx = await browser.newContext({ locale: 'es-ES' });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      return u.hostname === 'localhost' ? r.continue() : r.abort();
    });
    const p2 = await ctx.newPage();
    const errs = [];
    p2.on('pageerror', (e) => errs.push(e.message));
    const cdp = await ctx.newCDPSession(p2);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await p2.addInitScript((st) => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st)); }, STATE);
    await p2.goto(app.url.replace('127.0.0.1', 'localhost'));
    await p2.waitForTimeout(1200);
    await p2.click('#acctbtn'); await p2.waitForTimeout(400);
    await p2.fill('#lknew', '2468'); await p2.fill('#lkrep', '2468'); await p2.click('#lkon'); await p2.waitForTimeout(800);
    const hasBio = await p2.$('#lkbio');
    if (hasBio) { await p2.check('#lkbio'); await p2.waitForTimeout(1500); }
    ok('13 · en un móvil con Face ID / huella se puede activar', !!hasBio && /Face ID \/ huella ✓/.test(await p2.textContent('#lkmsg')), hasBio ? await p2.textContent('#lkmsg') : 'sin opción');
    await p2.reload();
    await p2.waitForTimeout(2500);
    ok('14 · al abrir, se desbloquea con Face ID / huella sin escribir el PIN', !(await p2.evaluate(() => !!document.querySelector('#lock'))));
    ok('15 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();

    // ---------- Móvil táctil: pantalla fija, sin zoom con dos toques seguidos ----------
    const tctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await tctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const t = await tctx.newPage();
    const terrs = [];
    t.on('pageerror', (e) => terrs.push(e.message));
    await t.addInitScript((st) => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st)); }, STATE);
    await t.goto(app.url);
    await t.waitForTimeout(1000);
    await t.evaluate(async () => { const m = await import('/js/bloqueo.js'); await m.enableLock('441177', 1); });
    await t.reload();
    await t.waitForTimeout(1200);
    const fixed = await t.evaluate(() => {
      const L = document.querySelector('#lock');
      const gap = document.querySelector('#lock .lk-pad');
      return [getComputedStyle(L).touchAction, getComputedStyle(gap).touchAction, getComputedStyle(document.querySelector('#lock [data-lk="4"]')).touchAction, getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow];
    });
    ok('16 · la pantalla del PIN está fija: no se desplaza ni se amplía con el dedo (ni entre las teclas)', fixed.slice(0, 3).every((x) => x === 'none') && fixed[3] === 'hidden' && fixed[4] === 'hidden', JSON.stringify(fixed));
    // Deslizar el dedo por encima no mueve nada
    const cdpT = await tctx.newCDPSession(t);
    const touch = (type, y) => cdpT.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
    await touch('touchStart', 700); for (const y of [600, 450, 300]) await touch('touchMove', y); await touch('touchEnd');
    await t.waitForTimeout(300);
    const still = await t.evaluate(() => [window.scrollY, Math.round(document.querySelector('#lock').getBoundingClientRect().top), window.visualViewport ? window.visualViewport.scale : 1]);
    ok('17 · al deslizar el dedo, la pantalla no se mueve', still[0] === 0 && still[1] === 0 && still[2] === 1, JSON.stringify(still));
    // PIN con cifras repetidas, tocadas muy seguidas (4 4 1 1 7 7)
    for (const d of '441177') { await t.tap('#lock [data-lk="' + d + '"]'); await t.waitForTimeout(60); }
    await t.waitForTimeout(800);
    const after2 = await t.evaluate(() => [!!document.querySelector('#lock'), window.visualViewport ? window.visualViewport.scale : 1]);
    ok('18 · dos toques seguidos en la misma cifra cuentan como dos, sin zoom, y se entra', !after2[0] && after2[1] === 1, JSON.stringify(after2));
    ok('19 · sin errores (móvil táctil)', !terrs.length, terrs.join(' | '));
    await tctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
