// Enlace corto para el cliente (con cuenta): los datos se guardan en la nube con un
// código secreto y el enlace queda corto. El cliente lo abre sin cuenta; caducado o
// borrado el servicio, ya no se abre. Sin conexión, sale el enlace largo.
// Uso: node tests/e2e/enlace-corto.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device, restLinks } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const madrid = (ms, o) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', ...o });
const NEXT = Date.now() + 5 * 36e5;
const STATE = {
  mov: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {},
  srv: [{ id: 's1', f: madrid(NEXT, { year: 'numeric', month: '2-digit', day: '2-digit' }), h: madrid(NEXT, { hour: '2-digit', minute: '2-digit' }), cl: 'Viajes Costa', o: 'Aeropuerto T3', d: 'Marbella', i: 95, p: 'pendiente', pa: 'MR JOHN SMITH', vu: 'BA490', tl: '+44 7700 900123' }],
  cfg: { nom: 'Alejandro', punto: 'Puerta 3', coche: 'Toyota Corolla', mat: '1234 ABC', tel: '+34 600 11 22 33', nif: '12345678Z', legal: { v: 1, at: '2026-11-20' } },
};

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    const A = await device(browser, app, store, { local: STATE, name: 'A' });
    const page = A.page;
    await page.waitForTimeout(2500);
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    // Una foto pequeña de verdad
    const shot = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await shot.setContent('<body style="margin:0;background:#8aa0d6"><h1 style="font:bold 90px Arial;margin:200px 100px">EXIT 3</h1></body>');
    const photo = await shot.screenshot({ type: 'jpeg', quality: 85 });
    await shot.close();

    await page.click('.tabs button[data-v="pa"]');
    await page.waitForTimeout(400);
    await page.click('.pa-main');
    await page.waitForTimeout(300);
    await page.setInputFiles('#lkfile', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForTimeout(800);
    await page.click('[data-llang="en"]');
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 8000 });
    const url = await page.getAttribute('#lkview', 'href');
    const wa = decodeURIComponent(await page.getAttribute('#lksend', 'href'));
    ok('1 · con cuenta, el enlace es corto (…/cliente.html#código de 20)', /\/cliente\.html#[A-Za-z0-9]{20}$/.test(url) && url.length < 80, url);
    ok('2 · el WhatsApp lleva el mensaje y el enlace corto', wa.endsWith('\n' + url) && wa.length < 260, wa.length + ' caracteres');
    const id = url.split('#')[1];
    const docu = store.db.get('enlaces/' + id);
    ok('3 · se guarda en la nube: tus datos de contacto y la foto, sin precio ni agencia ni NIF', docu && docu.o === 'u1' && docu.ph && /^[/_]9j[/_]/.test(docu.ph) && !/"i"|95,|Viajes Costa|12345678Z/.test(docu.d), docu ? docu.d : 'no');
    const srvLk = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).srv[0].lk);
    ok('4 · el servicio recuerda su enlace (el mismo si lo vuelves a mandar)', srvLk === id);

    // Cambias algo → el mismo enlace se actualiza
    await page.fill('#lkpunto', 'Puerta 4, junto a Costa Coffee');
    await page.waitForTimeout(100);
    const waiting = await page.evaluate(() => document.querySelector('#lksend').classList.contains('wait'));
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 8000 });
    ok('5 · al cambiar algo, espera a guardarlo y el MISMO enlace se actualiza', waiting && (await page.getAttribute('#lkview', 'href')) === url && /Puerta 4/.test(store.db.get('enlaces/' + id).d));

    // ---------- El cliente, sin cuenta ----------
    const cctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', timezoneId: 'Europe/London' });
    const asked = [];
    await cctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG={apiKey:'prueba',projectId:'prueba'};export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      if (u.hostname === 'firestore.googleapis.com') { asked.push(u.pathname + u.search); return restLinks(store)(r); }
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const c = await cctx.newPage();
    const cerrs = [];
    c.on('pageerror', (e) => cerrs.push(e.message));
    await c.goto(url);
    await c.waitForTimeout(1200);
    const text = await c.evaluate(() => document.body.innerText);
    ok('6 · el cliente lo abre sin cuenta y lo ve todo', /Hi John!/.test(text) && /Puerta 4, junto a Costa Coffee/.test(text) && /1234 ABC/.test(text) && /BA490/.test(text), text.slice(0, 80));
    ok('7 · con la foto del punto de encuentro', await c.evaluate(() => !!document.querySelector('img.ph') && document.querySelector('img.ph').naturalWidth > 50));
    ok('8 · pide solo ese documento, por su código', asked.length === 1 && asked[0] === '/v1/projects/prueba/databases/(default)/documents/enlaces/' + id + '?key=prueba', JSON.stringify(asked));

    // Código inventado / caducado
    await c.goto(url.replace(id, 'ZZZZZZZZZZZZZZZZZZZZ')); await c.reload(); await c.waitForTimeout(800);
    ok('9 · un código inventado no enseña nada', /incomplete or has expired/.test(await c.evaluate(() => document.body.innerText)));
    store.db.get('enlaces/' + id).exp.__ts = Date.now() - 1000;
    await c.goto(url); await c.reload(); await c.waitForTimeout(800);
    ok('10 · caducado (2 días después del servicio), ya no se abre', /incomplete or has expired/.test(await c.evaluate(() => document.body.innerText)));
    ok('11 · sin errores en la página del cliente', !cerrs.length, cerrs.join(' | '));
    await cctx.close();

    // Borrar el servicio borra su enlace
    await page.click('[data-close]');
    await page.click('.tabs button[data-v="tr"]');
    await page.waitForTimeout(300);
    await page.click('#ls [data-ds="s1"]');
    await page.waitForTimeout(800);
    ok('12 · al borrar el servicio, su enlace se borra de la nube', !store.db.has('enlaces/' + id));

    // Sin conexión: enlace largo (no te quedas sin poder mandarlo)
    await page.evaluate(async (st) => { const m = await import('/js/store.js'); m.S.srv.push({ ...st.srv[0], id: 's2', lk: undefined }); m.save(); }, STATE);
    await page.click('.tabs button[data-v="pa"]');
    await page.waitForTimeout(600);
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    await page.waitForTimeout(300);
    await A.setOffline(true);
    await page.click('.pa-main');
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 15000 });
    const offUrl = await page.getAttribute('#lkview', 'href');
    ok('13 · sin conexión: avisa y sale el enlace largo (funciona igual)', /cliente\.html#[A-Za-z0-9_-]{40,}/.test(offUrl) && /enlace sale largo/.test(await page.textContent('#lkstate')), offUrl.length + ' caracteres');
    await A.setOffline(false);
    ok('14 · sin errores en la app', !page.errors.length, page.errors.join(' | '));
    await A.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
