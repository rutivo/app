// Idioma: cambiar a inglés desde Cuenta (banderas), toda la app en inglés, factura bilingüe, volver a español.
// Uso: node tests/e2e/idioma.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
// «Hoy» en la hora de la app (Madrid): a medianoche el servidor de pruebas (UTC) aún va por el día anterior
const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const DATA = {
  mov: [{ id: 'm1', f: hoy, t: 'in', p: 'efectivo', i: 55, c: 'Carrera estación' }],
  srv: [{ id: 's1', f: '2026-11-19', h: '10:00', cl: 'Viajes Costa S.L.', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'tarjeta' }],
  gas: [], huc: [], fac: [], prv: [], jor: [], cli: { 'Viajes Costa S.L.': { nif: 'B12345674', dir: 'Av. Andalucía 3' } },
  cfg: { nom: 'Antonio Ruiz', nif: '12345678Z', dir: 'C/ Larios 1', loc: 'Málaga', iva: 10, facOn: 1, legal: { v: 1, at: '2026-11-20' } },
};

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 400, height: 860 } });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((d) => {
      if (localStorage.getItem('cajaTransfer')) return;
      for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0'], ['cajaTransfer', JSON.stringify(d)]]) localStorage.setItem(k, v);
    }, DATA);
    const tabs = () => page.evaluate(() => [...document.querySelectorAll('.tabs button')].map((b) => b.textContent.trim()).join(','));
    await page.goto(app.url);
    await page.waitForTimeout(1000);
    ok('1 · por defecto, en español', (await tabs()) === 'Caja,Transfer,Gasolina,Facturas,Hucha', await tabs());

    // Cuenta → Idioma: dos banderas
    await page.click('#acctbtn');
    await page.waitForTimeout(600);
    const flags = await page.evaluate(() => [...document.querySelectorAll('[data-lang-set]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
    ok('2 · en Cuenta hay «Idioma · Language» con 🇪🇸 Español y 🇬🇧 English', flags.length === 2 && /🇪🇸.*Español/.test(flags[0]) && /🇬🇧.*English/.test(flags[1]), flags.join(' | '));
    await Promise.all([page.waitForNavigation(), page.click('[data-lang-set="en"]')]);
    await page.waitForTimeout(1200);
    ok('3 · al tocar la bandera inglesa, la app pasa a inglés', (await tabs()) === 'Cash,Transfer,Fuel,Invoices,Savings', await tabs());
    const body = await page.evaluate(() => document.body.innerText);
    ok('4 · textos de la app en inglés (títulos, botones)', /Daily cash/.test(body) && /Save entry/.test(body) && /Income/.test(body), '');
    const all = await page.evaluate(() => document.body.textContent); // también lo de las pantallas que no se ven ahora
    ok('5 · tus datos se quedan como los escribiste', /Carrera estación/.test(body) && /Viajes Costa S\.L\./.test(all) && /Marbella/.test(all));
    ok('6 · se recuerda al volver a abrir', (await page.evaluate(() => localStorage.getItem('idioma'))) === 'en');

    // Factura bilingüe
    await page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.pick').forEach((c) => { c.checked = true; }));
    await page.evaluate(() => document.querySelector('#mk').click());
    await page.waitForTimeout(700);
    const sheet = await page.evaluate(() => document.querySelector('#sheet').innerText);
    ok('7 · factura bilingüe: «Factura / Invoice», «Base imponible / Tax base»…', /Factura \/ Invoice/.test(sheet) && /Base imponible \/ Tax base/.test(sheet) && /Total factura \/ Invoice total/.test(sheet), sheet.slice(0, 80).replace(/\n/g, ' '));
    const bar = await page.evaluate(() => [...document.querySelectorAll('#invwrap button')].map((b) => b.textContent.trim()).filter(Boolean).join(','));
    ok('8 · y sus botones en inglés', /Close/.test(bar) && /PDF/.test(bar), bar);
    await page.evaluate(() => document.querySelector('#cl').click());

    // Volver a español
    await page.click('#acctbtn');
    await page.waitForTimeout(600);
    await Promise.all([page.waitForNavigation(), page.click('[data-lang-set="es"]')]);
    await page.waitForTimeout(1200);
    ok('9 · y se puede volver a español', (await tabs()) === 'Caja,Transfer,Gasolina,Facturas,Hucha', await tabs());
    await page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('#lfac [data-of]'); if (b) b.click(); });
    await page.waitForTimeout(600);
    const sheetEs = await page.evaluate(() => document.querySelector('#sheet').innerText);
    ok('10 · en español la factura sale como siempre (sin inglés)', !/Invoice/.test(sheetEs) && /Factura/.test(sheetEs), sheetEs.slice(0, 60).replace(/\n/g, ' '));
    ok('11 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
