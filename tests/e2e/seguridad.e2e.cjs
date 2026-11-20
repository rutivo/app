// Tarea 4: verificación de email, licencia retirada, App Check apagado (navegador real).
// Uso: node tests/e2e/seguridad.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = { mov: [], srv: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    // Usuario SIN confirmar el email
    const A = await device(browser, app, store, { local: state });
    const reqs = [];
    A.page.on('request', (r) => reqs.push(r.url()));
    await A.page.evaluate(() => document.querySelector('#acctbtn').click());
    await wait(800);
    const card = await A.page.evaluate(() => { const c = document.querySelector('#verif'); return c ? c.innerText : ''; });
    ok('1 · sin confirmar el email: aviso en Cuenta (sin bloquear la app)', /Confirma tu email/.test(card) && /u1@prueba\.test/.test(card));
    await A.page.click('#verre');
    await wait(500);
    ok('2 · «Reenviar email» envía la confirmación', (await A.page.evaluate(() => self.__verifEnviados)) === 1 && /Enviado/.test(await A.page.innerText('#vermsg')));
    await A.page.click('#verok');
    await wait(500);
    ok('3 · «Ya lo he confirmado» sin confirmar: lo dice', /Aún no consta/.test(await A.page.innerText('#vermsg')));
    await A.page.evaluate(() => { self.__verificado = true; });
    await A.page.click('#verok');
    await wait(600);
    ok('4 · tras confirmarlo, el aviso desaparece', !(await A.page.$('#verif')));
    ok('5 · la app funciona igual con el email sin confirmar (no bloquea)', await A.page.evaluate(() => !!document.querySelector('.tabs')));
    ok('6 · ya no se carga la licencia insegura (license.js)', !reqs.some((u) => /license\.js/.test(u)) && !(await A.page.evaluate(() => document.body.innerText.includes('código de activación'))));
    ok('7 · App Check apagado: no se descarga nada de App Check ni reCAPTCHA', !reqs.some((u) => /app-check|recaptcha/i.test(u)));
    ok('8 · sin errores', !A.page.errors.length, A.page.errors.join(' | '));
    await A.ctx.close();

    // Usuario con el email ya confirmado: sin aviso
    const B = await device(browser, app, store, { local: null, owner: false });
    await B.page.addInitScript(() => { self.__verificado = true; });
    await B.page.reload();
    await wait(1500);
    await B.page.evaluate(() => document.querySelector('#acctbtn').click());
    await wait(600);
    ok('9 · con el email confirmado no hay aviso', !(await B.page.$('#verif')));
    await B.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
