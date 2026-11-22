// Rutivo en móvil, iPad y ordenador: nada se sale de la pantalla en ninguna
// pestaña, la Caja en dos columnas en pantallas grandes, barra y botones en su
// sitio, sin zoom por doble toque en los botones y Esc para cerrar (ordenador).
// Uso: node tests/e2e/pantallas.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
// El servicio, mañana: si fuera hoy y cercano, el aviso de «Transfer programado» taparía la pantalla según la hora de la prueba
const TOMORROW = (() => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); })();
const STATE = { mov: [{ id: 'a', f: TODAY, t: 'in', p: 'efectivo', i: 45, c: 'Carrera' }, { id: 'b', f: TODAY, t: 'out', p: 'tarjeta', i: 12, c: 'Peaje' }], srv: [{ id: 's1', f: TOMORROW, h: '23:50', cl: 'Viajes Costa S.L.', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'pendiente', pa: 'John Smith' }], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };
const SIZES = [['iPhone', 390, 844, true], ['iPad vertical', 820, 1180, true], ['iPad horizontal', 1180, 820, true], ['ordenador', 1440, 900, false]];

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    for (const [name, w, h, touch] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, locale: 'es-ES' });
      await ctx.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
        return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript((st) => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); localStorage.setItem('cajaTransfer', JSON.stringify(st)); }, STATE);
      await page.goto(app.url);
      await page.waitForTimeout(1200);
      const over = [];
      for (const v of ['hoy', 'tr', 'ga', 'fa', 'pa']) {
        await page.evaluate((v) => document.querySelector('.tabs button[data-v="' + v + '"]').click(), v);
        await page.waitForTimeout(250);
        const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (o > 0) over.push(v + ' +' + o + 'px');
      }
      ok(name + ' · ninguna pestaña se sale de la pantalla', !over.length, over.join(', '));
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabs button')].map((b) => Math.round(b.getBoundingClientRect().width)));
      ok(name + ' · la barra de pestañas tiene sus 5 botones con espacio', tabs.length === 5 && tabs.every((x) => x >= 56), tabs.join(','));
      const av = await page.evaluate(() => { const r = document.querySelector('#acctbtn').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), window.innerWidth]; });
      ok(name + ' · el botón de Cuenta está arriba a la derecha', av[1] <= av[2] && av[0] > av[2] * 0.5, JSON.stringify(av));
      await page.evaluate(() => document.querySelector('.tabs button[data-v="hoy"]').click());
      await page.waitForTimeout(300);
      const cols = await page.evaluate(() => { const a = document.querySelector('#mes').getBoundingClientRect(); const b = document.querySelector('#graf').getBoundingClientRect(); return { side: b.left > a.right, mesW: Math.round(a.width) }; });
      if (w >= 1100) ok(name + ' · Caja en dos columnas: el día a día a la izquierda y las estadísticas a la derecha', cols.side, JSON.stringify(cols));
      else ok(name + ' · Caja en una columna (estadísticas debajo)', !cols.side, JSON.stringify(cols));
      const ta = await page.evaluate(() => [...document.querySelectorAll('.tabs button, #fm button, #asisbtn')].every((b) => getComputedStyle(b).touchAction === 'manipulation' || getComputedStyle(b).touchAction === 'none'));
      ok(name + ' · dos toques seguidos en un botón no hacen zoom', ta);
      if (!touch) {
        await page.click('#asisbtn');
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        ok(name + ' · Esc cierra el asistente', !(await page.$('.siri')));
        await page.evaluate(() => document.querySelector('.tabs button[data-v="tr"]').click());
        await page.waitForTimeout(300);
        await page.evaluate(() => { const b = document.querySelector('#ls [data-go]'); if (b) b.click(); });
        await page.waitForTimeout(300);
        const opened = !!(await page.$('.bsheet'));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        ok(name + ' · Esc cierra los paneles (p. ej. «Llevarme»)', opened && !(await page.$('.bsheet')));
      }
      ok(name + ' · sin errores', !errs.length, errs.join(' | '));
      await ctx.close();
    }
    // PIN: dos toques seguidos en el mismo número no hacen zoom
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" }); return u.hostname === '127.0.0.1' ? r.continue() : r.abort(); });
    const p = await ctx.newPage();
    await p.addInitScript(() => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); });
    await p.goto(app.url); await p.waitForTimeout(800);
    await p.evaluate(async () => { await (await import('/js/bloqueo.js')).enableLock('115577', 1); });
    await p.reload(); await p.waitForTimeout(1000);
    const padTA = await p.evaluate(() => getComputedStyle(document.querySelector('#lock [data-lk="1"]')).touchAction);
    for (const d of '115577') await p.tap('#lock [data-lk="' + d + '"]');
    await p.waitForTimeout(600);
    const zoom = await p.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1));
    ok('PIN · con números repetidos (115577) no hace zoom y se entra', padTA === 'manipulation' && zoom === 1 && !(await p.$('#lock')), padTA + ' · zoom ' + zoom);
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
