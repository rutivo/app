// Panel Transfer (en el sitio de la antigua Hucha): el próximo servicio en grande,
// hoy, mañana, lo que te deben, y desde ahí el enlace para el cliente con la
// foto del punto de encuentro (pequeña, dentro del enlace). La Hucha ya no se ve,
// pero lo que tenía apuntado sigue guardado.
// Uso: node tests/e2e/panel.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const madrid = (ms, o) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', ...o });
const day = (ms) => madrid(ms, { year: 'numeric', month: '2-digit', day: '2-digit' });
const hour = (ms) => madrid(ms, { hour: '2-digit', minute: '2-digit' });
const now = Date.now();
const NEXT = now + 3 * 36e5; // dentro de 3 h (puede caer mañana si es de noche: da igual, es «el próximo»)
const STATE = {
  mov: [], gas: [], prv: [], jor: [], fac: [], cli: {},
  huc: [{ id: 'h1', f: day(now - 864e5), i: 20, h: 'main' }],
  srv: [
    { id: 'n1', f: day(NEXT), h: hour(NEXT), cl: 'Viajes Costa', o: 'Aeropuerto T3', d: 'Marbella', i: 95, p: 'pendiente', pa: 'MR JOHN SMITH', vu: 'BA490', tl: '+44 7700 900123' },
    { id: 'n2', f: day(now + 30 * 36e5), h: '09:00', cl: 'Hotel Riu', o: 'Torremolinos', d: 'Aeropuerto', i: 40, p: 'tarjeta', pa: 'Laura Gómez' },
    { id: 'old', f: day(now - 3 * 864e5), h: '10:00', cl: 'SunTours', o: 'Málaga', d: 'Ronda', i: 210, p: 'pendiente' },
  ],
  cfg: { nom: 'Alejandro', punto: 'Puerta 3', coche: 'Toyota Corolla', mat: '1234 ABC', tel: '+34 600 11 22 33', legal: { v: 1, at: '2026-11-20' }, huchas: [{ id: 'main', n: 'Mi hucha', e: '🐷', g: 500 }] },
};
const CONFIG = "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';";

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // Una foto de verdad (JPEG grande, como la de un móvil)
    const shot = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await shot.setContent('<body style="margin:0;background:linear-gradient(135deg,#8aa0d6,#f3d9b1)"><div style="margin:300px 200px;padding:60px;background:#fff;font:bold 120px Arial;transform:rotate(-4deg)">EXIT 3 · JOHN SMITH</div></body>');
    const photo = await shot.screenshot({ type: 'jpeg', quality: 92 });
    await shot.close();

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: CONFIG }); return u.hostname === '127.0.0.1' ? r.continue() : r.abort(); });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((st) => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st)); }, STATE);
    await page.goto(app.url);
    await page.waitForTimeout(1000);
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();

    const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabs button')].map((b) => b.textContent.trim()));
    ok('1 · la Hucha ya no está: en su sitio, «Panel»', tabs.join(',') === 'Caja,Transfer,Gasolina,Facturas,Panel' && !(await page.$('#v-hu')), tabs.join(','));
    await page.click('.tabs button[data-v="pa"]');
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => document.querySelector('#v-pa').innerText);
    ok('2 · el próximo servicio sale en grande, con el cliente, el trayecto y lo que falta', /PRÓXIMA RECOGIDA/.test(text) && /MR JOHN SMITH/.test(text) && /Aeropuerto T3 → Marbella/.test(text) && /en \d/.test(text), text.slice(0, 120));
    const kpi = await page.evaluate(() => [...document.querySelectorAll('.pa-kpis b')].map((b) => b.textContent));
    ok('3 · arriba: por cobrar (95 + 210) y servicios de la semana', kpi[1].replace(/\s/g, ' ') === '305,00 €' && kpi[2] === '2', JSON.stringify(kpi));
    ok('4 · «Te deben»: el servicio pasado sin cobrar', /Te deben/.test(text) && /SunTours/.test(text) && /210,00/.test(text));
    ok('5 · el resto, por días (mañana / esta semana)', /Laura Gómez/.test(text));
    const btns = await page.evaluate(() => [...document.querySelectorAll('.pa-next button')].map((b) => b.textContent.trim()));
    ok('6 · todo a mano: enlace, Llevarme, Cartel, Vuelo, Bienvenida, Mensajes', ['🔗 Enviar enlace al cliente', '📍 Llevarme', 'Cartel', '✈️ Vuelo', '✉️ Mensajes'].every((b) => btns.some((x) => x.startsWith(b))), btns.join(' | '));

    // Cobrar desde el panel (el mismo botón que en Transfer)
    await page.click('.pa-debt [data-pay="old"]');
    await page.waitForTimeout(300);
    await page.click('.pay-sheet [data-set="tarjeta"]');
    await page.waitForTimeout(400);
    const paid = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).srv.find((s) => s.id === 'old').p);
    ok('7 · se cobra desde el panel y desaparece de «Te deben»', paid !== 'pendiente' && !/SunTours/.test(await page.evaluate(() => document.querySelector('#v-pa').innerText)), paid);

    // Enlace con la foto del punto de encuentro
    await page.click('.pa-main');
    await page.waitForTimeout(400);
    await page.setInputFiles('#lkfile', { name: 'puerta.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForTimeout(1200);
    const thumb = await page.evaluate(() => { const i = document.querySelector('#lkimg'); return !i.hidden && i.naturalWidth; });
    const url = (await page.getAttribute('#lkview', 'href')).replace('?vista=1', '');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).cfg.pfoto || '');
    ok('8 · eliges la foto y sale en pequeño (se recuerda para todos tus enlaces)', thumb > 0 && saved.startsWith('data:image/jpeg;base64,/9j/'), 'foto de ' + Math.round(photo.length / 1024) + ' KB → ' + Math.round(saved.length * 0.75 / 1024) + ' KB');
    ok('9 · la foto va dentro del enlace, que sigue siendo razonable', /#[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url) && url.length < 14000, url.length + ' caracteres');
    const c = await ctx.newPage();
    await c.goto(url);
    await c.waitForTimeout(800);
    const img = await c.evaluate(() => { const i = document.querySelector('img.ph'); return i ? [i.naturalWidth, i.naturalHeight] : null; });
    ok('10 · el cliente ve la foto del punto de encuentro', img && img[0] > 100, JSON.stringify(img));
    await c.close();
    await page.click('#lkdel');
    await page.waitForTimeout(200);
    ok('11 · y se puede quitar', !(await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).cfg.pfoto)) && !/\./.test(((await page.getAttribute('#lkview', 'href')).replace('?vista=1', '')).split('#')[1]));

    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).huc);
    ok('12 · lo que había en la Hucha sigue guardado (no se borra nada)', kept.length === 1 && kept[0].i === 20);
    ok('13 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
