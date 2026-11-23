// Asistente escondido (ASSISTANT_ENABLED=false): la app NUNCA pide el micrófono,
// ni al abrir, ni al tocar la pantalla, ni al desbloquear con el PIN, ni al
// volver a la app. «Oye Rutivo» se deja con su valor por defecto (activado).
// Uso: node tests/e2e/sin-micro.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const STATE = { mov: [], srv: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const A = await device(browser, app, createFirestore(), { local: STATE, name: 'A' });
    const page = A.page;
    // Como en producción: asistente escondido
    await A.ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG={apiKey:'prueba',projectId:'prueba',authDomain:'prueba.test',appId:'1'};export const TRIAL_ENABLED=false;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';export const ASSISTANT_ENABLED=false;" }));
    // Cuenta las veces que se pide el micro (permiso ya dado: si algo lo pidiera, se notaría)
    await A.ctx.addInitScript(() => {
      self.__mic = 0;
      const W = self.Worker; // el reconocedor de voz va en un Worker: arrancarlo = descargar y luego pedir el micro
      self.Worker = function (u, o) { if (/oido/i.test(String(u))) self.__mic++; return new W(u, o); };
      const md = navigator.mediaDevices || {};
      md.getUserMedia = () => { self.__mic++; return Promise.reject(new Error('sin micro en la prueba')); };
      if (navigator.permissions) navigator.permissions.query = async () => ({ state: 'granted', addEventListener() {} });
    });
    await page.evaluate(() => localStorage.removeItem('oyeRutivo')); // «Oye Rutivo» por defecto
    await page.reload();
    await page.waitForTimeout(2500);
    const mic = () => page.evaluate(() => self.__mic);

    ok('1 · al abrir la app no pide el micrófono', (await mic()) === 0, (await mic()) + ' veces');
    ok('2 · no se ve el botón del asistente', !(await page.evaluate(() => { const b = document.querySelector('#asisbtn'); return b && b.offsetParent; })));
    await page.mouse.click(200, 400);
    await page.waitForTimeout(1200);
    ok('3 · al tocar la pantalla no pide el micrófono', (await mic()) === 0, (await mic()) + ' veces');

    // Con PIN: al desbloquear no debe pedirlo (antes sí: se volvía a encender «Oye Rutivo»)
    await page.evaluate(async () => { const m = await import('/js/bloqueo.js'); await m.enableLock('4821', 1); });
    await page.reload();
    await page.waitForTimeout(1500);
    for (const d of '4821') await page.click('#lock [data-lk="' + d + '"]');
    await page.waitForTimeout(2000);
    ok('4 · al desbloquear con el PIN no pide el micrófono', !(await page.$('#lock')) && (await mic()) === 0, (await mic()) + ' veces');

    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.mouse.click(200, 400);
    await page.waitForTimeout(1500);
    ok('5 · al volver a la app y tocar no pide el micrófono', (await mic()) === 0, (await mic()) + ' veces');
    ok('6 · sin errores en la página', page.errors.length === 0, page.errors.join(' | ').slice(0, 120));
  } finally {
    await browser.close();
    app.server.close();
  }
  const n = res.filter(Boolean).length;
  console.log(n + '/' + res.length + ' passed');
  process.exit(n === res.length ? 0 : 1);
})();
