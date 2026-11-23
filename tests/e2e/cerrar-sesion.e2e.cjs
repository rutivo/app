// «Cerrar sesión»: primer toque avisa, segundo toque sale de verdad, aunque la
// pantalla de Cuenta se vuelva a pintar entre los dos toques (sincronización).
// Los toques imitan al iPhone: el botón no se queda con el foco (por eso se repintaba).
// Uso: node tests/e2e/cerrar-sesion.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const STATE = { mov: [{ id: 'm1', f: TODAY, t: 'in', p: 'efectivo', i: 30, c: 'Carrera' }], srv: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };
const label = (page) => page.evaluate(() => document.querySelector('#alo b, #alo [data-label]')?.textContent || document.querySelector('#alo')?.textContent || '(sin botón)');
const tapIphone = (page) => page.evaluate(() => document.querySelector('#alo').click()); // sin foco, como en Safari de iPhone
const loggedIn = (page) => page.evaluate(() => !!document.querySelector('#alo'));

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // Caso 1: tocar dos veces seguidas
    {
      const A = await device(browser, app, createFirestore(), { local: STATE, name: 'A' });
      const page = A.page;
      await A.ctx.addInitScript(() => { self.__salidaReal = true; });
      await page.reload();
      await page.waitForTimeout(2500);
      await page.click('#acctbtn'); await page.waitForTimeout(600);
      ok('1 · con sesión iniciada se ve «Cerrar sesión»', await loggedIn(page));
      await tapIphone(page); await page.waitForTimeout(1200);
      const armed = await label(page);
      ok('2 · el primer toque pide confirmar (no sale aún)', /otra vez/i.test(armed) && await loggedIn(page), armed);
      await tapIphone(page);
      await page.waitForTimeout(7000);
      const mov = await page.evaluate(() => (JSON.parse(localStorage.getItem('cajaTransfer') || '{}').mov || []).length);
      ok('3 · el segundo toque cierra la sesión y borra los datos del móvil', !(await loggedIn(page)) && mov === 0 && await page.evaluate(() => !!document.querySelector('.auth-wall')), 'movimientos en el móvil: ' + mov);
      await A.ctx.close();
    }
    // Caso 2: la pantalla se vuelve a pintar entre los dos toques (llega una sincronización)
    {
      const A = await device(browser, app, createFirestore(), { local: STATE, name: 'B' });
      const page = A.page;
      await A.ctx.addInitScript(() => { self.__salidaReal = true; });
      await page.reload();
      await page.waitForTimeout(2500);
      await page.click('#acctbtn'); await page.waitForTimeout(600);
      await tapIphone(page); await page.waitForTimeout(1200);
      await page.evaluate(() => window.dispatchEvent(new Event('rutivo:sync'))); // se repinta Cuenta
      await page.waitForTimeout(300);
      const armed = await label(page);
      ok('5 · tras repintarse la pantalla, sigue pidiendo el segundo toque', /otra vez/i.test(armed), armed);
      await tapIphone(page);
      await page.waitForTimeout(7000);
      ok('6 · y el segundo toque sale de verdad', !(await loggedIn(page)));
      ok('7 · sin errores en la página', page.errors.length === 0, page.errors.join(' | ').slice(0, 120));
      await A.ctx.close();
    }
  } finally {
    await browser.close();
    app.server.close();
  }
  const n = res.filter(Boolean).length;
  console.log(n + '/' + res.length + ' passed');
  process.exit(n === res.length ? 0 : 1);
})();
