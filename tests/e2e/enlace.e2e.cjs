// Transfer → 🔗 Enlace: el conductor lo prepara y lo manda por WhatsApp; el cliente
// lo abre (en Londres, en inglés) y ve su traslado, su vuelo con la hora de Málaga
// y botones para escribir o llamar. Un enlace manipulado no ejecuta nada.
// Uso: node tests/e2e/enlace.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const WORKER = 'https://rutivo-vuelos.pokeboostmlg.workers.dev';
// Recogida dentro de 90 minutos (hora de España), para que el cliente vea su vuelo
const pickMs = Date.now() + 90 * 6e4;
const madrid = (ms, o) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', ...o });
const DAY = madrid(pickMs, { year: 'numeric', month: '2-digit', day: '2-digit' });
const HOUR = madrid(pickMs, { hour: '2-digit', minute: '2-digit' });
const LANDED = new Date(Date.now() - 10 * 6e4);
const STATE = { mov: [], srv: [{ id: 's1', f: DAY, h: HOUR, cl: 'Viajes Costa S.L.', o: 'Aeropuerto de Málaga T3', d: 'Puente Romano, Marbella', i: 95, p: 'pendiente', pa: 'MR JOHN SMITH', vu: 'BA490', tl: '+44 7700 900123' }],
  gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Alejandro Fernández', nif: '12345678Z', punto: 'Terminal 3, puerta de salida 3', legal: { v: 1, at: '2026-11-20' } } };
const CONFIG = "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='" + WORKER + "';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';";

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // ---------- El conductor ----------
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: CONFIG }); return u.hostname === '127.0.0.1' ? r.continue() : r.abort(); });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((st) => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0'], ['transferPopup', 'x']]) localStorage.setItem(k, v); if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st)); }, STATE);
    await page.goto(app.url);
    await page.waitForTimeout(1000);
    // Cierra el aviso de «Transfer programado» si sale (el servicio es dentro de 90 min)
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    await page.click('.tabs button[data-v="tr"]');
    await page.waitForTimeout(400);
    const btn = await page.$('#ls [data-lnk="s1"]');
    ok('1 · cada servicio de Transfer tiene «🔗 Enlace»', !!btn);
    await btn.click();
    await page.waitForTimeout(400);
    const warn = await page.textContent('#lkwarn');
    ok('2 · avisa de lo que falta para que el cliente lo vea todo (teléfono y coche)', /tu teléfono/.test(warn) && /tu coche/.test(warn) && !/dónde le esperas/.test(warn), warn);
    await page.fill('#lkcoche', 'Toyota Corolla blanco');
    await page.fill('#lkmat', '1234 abc');
    await page.fill('#lktel', '+34 600 11 22 33');
    await page.dispatchEvent('#lktel', 'change');
    await page.click('[data-llang="en"]');
    await page.waitForTimeout(200);
    ok('3 · con todo puesto, ya no avisa de nada (y se recuerda para la próxima)', (await page.textContent('#lkwarn')) === '' && /600 11 22 33/.test(await page.evaluate(() => localStorage.getItem('cajaTransfer'))));
    const wa = decodeURIComponent(await page.getAttribute('#lksend', 'href'));
    const url = (await page.getAttribute('#lkview', 'href')).replace('?vista=1', '');
    ok('4 · «Enviárselo por WhatsApp» va al teléfono del cliente con un mensaje en inglés y el enlace', wa.startsWith('https://wa.me/447700900123?text=Hi John! I\'m Alejandro, your driver.') && wa.endsWith(url), wa.slice(0, 90));
    ok('5 · el enlace es la página del cliente con los datos después de «#» (no llegan a ningún servidor)', /\/cliente\.html#[A-Za-z0-9_-]+$/.test(url), url.slice(0, 70));
    ok('6 · sin errores en la app', !errs.length, errs.join(' | '));
    await ctx.close();

    // ---------- El cliente, en Londres ----------
    const cctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', timezoneId: 'Europe/London' });
    const asked = [];
    await cctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: CONFIG });
      if (u.origin === WORKER) {
        asked.push(u.pathname + u.search);
        return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ found: true, number: 'BA490', status: 'Arrived', arr: { sched: new Date(LANDED - 14 * 6e4).toISOString(), runway: LANDED.toISOString(), terminal: '3' } }) });
      }
      if (u.hostname !== '127.0.0.1') asked.push('FUERA ' + u.href);
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const c = await cctx.newPage();
    const cerrs = [];
    c.on('pageerror', (e) => cerrs.push(e.message));
    await c.goto(url);
    await c.waitForTimeout(1500);
    const text = await c.evaluate(() => document.body.innerText);
    ok('7 · el cliente ve su saludo y que su vuelo ha aterrizado, en inglés', /Hi John!/.test(text) && /Welcome! Your flight has landed/i.test(text), text.slice(0, 120));
    ok('8 · ve tu nombre, tu coche, tu matrícula y dónde le esperas', /Alejandro/.test(text) && /Toyota Corolla blanco/.test(text) && /1234 ABC/.test(text) && /Terminal 3, puerta de salida 3/.test(text));
    const landedClock = LANDED.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
    ok('9 · la hora del vuelo sale en hora de Málaga aunque su móvil esté en Londres', text.includes('Landed ' + landedClock + ' (local time)') && /14 min late/.test(text) && /Terminal 3/.test(text), landedClock);
    ok('10 · y la hora de recogida, también la de Málaga', text.includes(HOUR), HOUR);
    const links = await c.evaluate(() => [...document.querySelectorAll('.btns a')].map((a) => a.getAttribute('href')));
    ok('11 · botones para escribirte por WhatsApp o llamarte', links[0] === 'https://wa.me/34600112233' && links[1] === 'tel:+34600112233', JSON.stringify(links));
    ok('12 · no ve el precio, ni la agencia, ni tus datos fiscales', !/95|Viajes Costa|12345678Z|7700/.test(text));
    ok('13 · la página solo pide el vuelo (una vez), nada de cuentas ni de fuera', asked.length === 1 && asked[0] === '/flight?n=BA490&d=' + DAY, JSON.stringify(asked));

    // ---------- Enlace manipulado y enlace roto ----------
    let dialog = false;
    c.on('dialog', (d) => { dialog = true; d.dismiss(); });
    const evil = Buffer.from(JSON.stringify({ v: 1, d: '<img src=x onerror=alert(1)>', p: '<script>alert(2)</script>', dt: DAY })).toString('base64url');
    await c.goto(url.split('#')[0] + '#' + evil);
    await c.reload();
    await c.waitForTimeout(800);
    const injected = await c.evaluate(() => document.querySelectorAll('main img, main script').length);
    ok('14 · un enlace manipulado no ejecuta nada: se ve como texto', !dialog && injected === 0 && (await c.evaluate(() => document.body.innerText)).includes('<img src=x onerror=alert(1)>'));
    await c.goto(url.split('#')[0] + '#roto');
    await c.reload();
    await c.waitForTimeout(500);
    ok('15 · un enlace roto lo explica (pide al conductor que lo reenvíe)', /ask your driver to send it again/.test(await c.evaluate(() => document.body.innerText)));
    ok('16 · sin errores en la página del cliente', !cerrs.length, cerrs.join(' | '));
    await cctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
