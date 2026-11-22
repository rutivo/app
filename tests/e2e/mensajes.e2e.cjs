// Transfer → ✉️ Mensajes: plantilla con los datos del servicio, idioma del
// cliente, minutos, coche, enlace de WhatsApp al teléfono del servicio y
// plantillas propias.
// Uso: node tests/e2e/mensajes.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const TOMORROW = (() => { const d = new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); })();
const STATE = { mov: [], srv: [{ id: 's1', f: TOMORROW, h: '23:50', cl: 'Viajes Costa S.L.', o: 'Aeropuerto de Málaga', d: 'Marbella', i: 95, p: 'pendiente', pa: 'MR JOHN SMITH', vu: 'BA490', tl: '+44 7700 900123' }],
  gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio Ruiz', punto: 'la cafetería de llegadas', legal: { v: 1, at: '2026-11-20' } } };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
    await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" }); return u.hostname === '127.0.0.1' ? r.continue() : r.abort(); });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((st) => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st)); }, STATE);
    await page.goto(app.url);
    await page.waitForTimeout(1000);
    await page.click('.tabs button[data-v="tr"]');
    await page.waitForTimeout(400);
    const btn = await page.$('#ls [data-msg="s1"]');
    ok('1 · cada servicio de Transfer tiene «✉️ Mensajes»', !!btn);
    await btn.click();
    await page.waitForTimeout(400);
    const txt = () => page.inputValue('#mtx');
    let t = await txt();
    ok('2 · abre con un mensaje listo con los datos del servicio', t === 'Hola John, soy Antonio, tu conductor. Ya estoy en llegadas esperándote con un cartel con tu nombre. Te espero en la cafetería de llegadas.', t);
    const href = decodeURIComponent(await page.getAttribute('#msend', 'href'));
    ok('3 · «Enviar por WhatsApp» va al teléfono del servicio con ese texto', href.startsWith('https://wa.me/447700900123?text=Hola John'), href.slice(0, 60));
    await page.click('[data-mlang="en"]');
    t = await txt();
    ok('4 · en inglés, con un toque', /^Hi John, this is Antonio, your driver\./.test(t), t.slice(0, 50));
    await page.click('[data-mid="llego"]');
    const minVisible = await page.isVisible('#mmin');
    await page.click('[data-mmin="15"]');
    t = await txt();
    ok('5 · «Llego en unos minutos»: eliges los minutos', minVisible && t === 'Hi John, this is Antonio. I\'ll be there in 15 minutes.', t);
    await page.click('[data-mid="coche"]');
    await page.fill('#mcoche', 'Toyota Corolla blanco'); await page.dispatchEvent('#mcoche', 'change');
    await page.fill('#mmat', '1234 abc'); await page.dispatchEvent('#mmat', 'change');
    t = await txt();
    ok('6 · «Mi coche»: tu coche y matrícula (se recuerdan)', t === 'I\'ll be waiting in a Toyota Corolla blanco, number plate 1234 ABC.' && /Toyota/.test(await page.evaluate(() => localStorage.getItem('cajaTransfer'))), t);
    await page.click('[data-mid="retraso"]');
    const warn = await page.textContent('#mwarn');
    t = await txt();
    ok('7 · si no se sabe la hora del vuelo, lo avisa y esa frase no se envía', /hora de llegada del vuelo/.test(warn) && !/landing at/.test(t) && !/\{/.test(t), t);
    await page.click('[data-mlang="es"]');
    await page.click('[data-mid="llegadas"]');
    await page.fill('#mtx', 'Hola John, estoy en la puerta 3 con el cartel.');
    await page.click('#msave');
    await page.waitForTimeout(300);
    const mine = await page.evaluate(() => [...document.querySelectorAll('#mlist [data-mid]')].map((b) => b.textContent).filter((x) => x.startsWith('⭐')));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).cfg.msgs);
    ok('8 · «Guardar como plantilla»: queda entre las tuyas, con el nombre como dato', mine.length === 1 && saved[0].text === 'Hola {nombre}, estoy en la puerta 3 con el cartel.' && saved[0].title === 'Estoy en la puerta 3 con…', JSON.stringify(saved));
    await page.click('#mlist [data-mdel]');
    await page.waitForTimeout(200);
    ok('9 · y se puede borrar', (await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).cfg.msgs.length)) === 0);
    ok('10 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
