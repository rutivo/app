// Enlace corto para el cliente (con cuenta): los datos se guardan en la nube con un
// código secreto y el enlace queda corto. El cliente lo abre sin cuenta; caducado o
// borrado el servicio, ya no se abre. Sin conexión, sale el enlace largo.
// Uso: node tests/e2e/enlace-corto.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device, restLinks, linkRule } = require('./firebase-falso.cjs');

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
    await A.ctx.route('https://firestore.googleapis.com/v1/**', restLinks(store)); // la vista previa lee el enlace como el cliente
    await page.waitForTimeout(2500);
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    // Una foto pequeña de verdad
    const shot = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await shot.setContent('<body style="margin:0;background:#8aa0d6"><h1 style="font:bold 90px Arial;margin:200px 100px">EXIT 3</h1></body>');
    const photo = await shot.screenshot({ type: 'jpeg', quality: 85 });
    await shot.close();

    // Una foto de móvil de verdad: grande y con mucho detalle (lo que más pesa en JPEG)
    const big = await browser.newPage({ viewport: { width: 2016, height: 1512 } });
    await big.setContent('<canvas id="c" width="2016" height="1512"></canvas><script>const g=c.getContext("2d");for(let i=0;i<60000;i++){g.fillStyle="hsl("+(Math.random()*360)+",70%,"+(30+Math.random()*50)+"%)";g.fillRect(Math.random()*2016,Math.random()*1512,3+Math.random()*30,3+Math.random()*30);}g.fillStyle="#000";g.font="bold 160px Arial";g.fillText("LA MANON",500,300);</script><style>body{margin:0}</style>');
    const realPhoto = await big.screenshot({ type: 'jpeg', quality: 92 });
    await big.close();

    // Una foto guardada con la versión anterior (pequeña): avisa de que se ve borrosa
    await page.evaluate(async () => { const m = await import('/js/store.js'); m.S.cfg.pfoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k='; delete m.S.cfg.pfv; m.save(); });
    await page.click('.tabs button[data-v="pa"]');
    await page.waitForTimeout(400);
    await page.click('.pa-main');
    await page.waitForTimeout(300);
    ok('0 · si la foto es de la versión anterior (pequeña), avisa de que se ve borrosa', await page.isVisible('#lkold'));
    await page.setInputFiles('#lkfile', { name: 'manon.jpg', mimeType: 'image/jpeg', buffer: realPhoto });
    await page.waitForTimeout(1500);
    const hq = await page.evaluate(async () => { const d = JSON.parse(localStorage.getItem('cajaTransfer')).cfg.pfoto; const i = new Image(); await new Promise((r) => { i.onload = r; i.src = d; }); return [i.naturalWidth, d.length]; });
    ok('0b · foto de 2016 px con muchísimo detalle: se guarda nítida (≥ 900 px; una foto real de móvil sale a 1600 px) y cabe (≤ 200.000) — y el aviso desaparece', hq[0] >= 900 && hq[1] <= 200000 + 30 && !(await page.isVisible('#lkold')), hq[0] + ' px · ' + Math.round(hq[1] * 0.75 / 1024) + ' KB');
    await page.setInputFiles('#lkfile', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForTimeout(800);
    await page.click('[data-llang="en"]');
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 8000 });
    const url = (await page.getAttribute('#lkview', 'href')).replace('?vista=1', '');
    const wa = decodeURIComponent(await page.getAttribute('#lksend', 'href'));
    ok('1 · con cuenta, el enlace es corto (…/cliente.html#código de 20)', /\/cliente\.html#[A-Za-z0-9]{20}$/.test(url) && url.length < 80, url);
    ok('2 · el WhatsApp lleva el mensaje y el enlace corto', wa.endsWith('\n' + url) && wa.length < 260, wa.length + ' caracteres');
    const id = url.split('#')[1];
    const docu = store.db.get('enlaces/' + id);
    ok('3 · se guarda en la nube: tus datos de contacto y la foto, sin precio, agencia, NIF ni tu código de usuario (el «es mío» va aparte, en tu zona)', docu && !('o' in docu) && store.db.has('users/u1/enlaces/' + id) && docu.ph && /^[/_]9j[/_]/.test(docu.ph) && !/"i"|95,|Viajes Costa|12345678Z/.test(docu.d), docu ? docu.d : 'no');
    const srvLk = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).srv[0].lk);
    ok('4 · el servicio recuerda su enlace (el mismo si lo vuelves a mandar)', srvLk === id);

    // Cambias algo → el mismo enlace se actualiza
    await page.fill('#lkpunto', 'Puerta 4, junto a Costa Coffee');
    await page.waitForTimeout(100);
    const waiting = await page.evaluate(() => document.querySelector('#lksend').classList.contains('wait'));
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 8000 });
    // «👀 Ver lo que verá»: dentro de la app, con barra para volver (el cliente nunca la ve)
    const preview = await page.getAttribute('#lkview', 'href');
    ok('4b · «Ver lo que verá» se abre en la app (no en otra ventana) y el enlace del cliente no lleva la barra', preview === url.replace('#', '?vista=1#') && !(await page.getAttribute('#lkview', 'target')) && !wa.includes('vista'));
    await page.click('#lkview');
    await page.waitForTimeout(1200);
    const bar = await page.$('button.back');
    ok('4c · en la vista previa sale «← Volver a Rutivo»', !!bar && /Hi John!/.test(await page.evaluate(() => document.body.innerText)));
    await bar.click();
    await page.waitForTimeout(2000);
    ok('4d · y al tocarlo vuelves a la app', /\/(index\.html)?$/.test(new URL(page.url()).pathname) && !!(await page.$('.tabs')), page.url());
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    await page.click('.tabs button[data-v="pa"]');
    await page.waitForTimeout(400);
    await page.click('.pa-main');
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 8000 });
    ok('5 · al cambiar algo, espera a guardarlo y el MISMO enlace se actualiza', waiting && ((await page.getAttribute('#lkview', 'href')).replace('?vista=1', '')) === url && /Puerta 4/.test(store.db.get('enlaces/' + id).d));

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
    const w = await c.evaluate(() => (document.querySelector('img.ph') || {}).naturalWidth || 0);
    ok('7 · con la foto del punto de encuentro en buena calidad (tamaño real, antes como mucho 420 px)', w === 800, w + ' px · ' + Math.round(store.db.get('enlaces/' + id).ph.length * 0.75 / 1024) + ' KB');
    const thumb = await c.evaluate(() => { const r = document.querySelector('.phb img').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    await c.click('.phb');
    await c.waitForTimeout(300);
    const lb = await c.evaluate(() => { const i = document.querySelector('.lb img'); if (!i) return null; const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), i.naturalWidth]; });
    ok('7b · en pequeño dentro de la tarjeta; al tocarla, en grande a pantalla completa', thumb[1] === 220 && lb && lb[0] >= 380 && lb[2] === 800, JSON.stringify({ pequeña: thumb, grande: lb }));
    await c.click('.lbx');
    await c.waitForTimeout(200);
    ok('7c · y se cierra con la ✕', !(await c.$('.lb')));
    ok('8 · pide solo ese documento, por su código', asked.length === 1 && asked[0] === '/v1/projects/prueba/databases/(default)/documents/enlaces/' + id + '?key=prueba', JSON.stringify(asked));

    // Código inventado / caducado
    await c.goto(url.replace(id, 'ZZZZZZZZZZZZZZZZZZZZ')); await c.reload(); await c.waitForTimeout(800);
    ok('9 · un código inventado no enseña nada', /incomplete or has expired/.test(await c.evaluate(() => document.body.innerText)));
    store.db.get('enlaces/' + id).exp.__ts = Date.now() - 1000;
    await c.goto(url); await c.reload(); await c.waitForTimeout(800);
    ok('10 · caducado (2 días después del servicio), ya no se abre', /incomplete or has expired/.test(await c.evaluate(() => document.body.innerText)));
    ok('11 · sin errores en la página del cliente', !cerrs.length, cerrs.join(' | '));
    await cctx.close();

    // ---------- App Check en la página del cliente ----------
    // Con la clave de App Check, la página manda la prueba («X-Firebase-AppCheck») al leer el enlace;
    // si no la consigue, lo pide igual (mientras no se «Aplique», Firestore no la exige).
    const appCheck = async (fails) => {
      const x = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
      const heads = [];
      await x.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG={apiKey:'prueba',projectId:'prueba'};export const FIREBASE_SDK=new URL('/__ac', location.href).href;export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='clave-publica';" });
        if (u.pathname === '/__ac/firebase-app.js') return r.fulfill({ contentType: 'text/javascript', body: 'export const initializeApp = (c) => ({ c });' });
        if (u.pathname === '/__ac/firebase-app-check.js') return r.fulfill({ contentType: 'text/javascript', body: 'export class ReCaptchaEnterpriseProvider { constructor(k) { this.k = k; } }\nexport const initializeAppCheck = (a, o) => ({ o });\nexport const getToken = async () => { ' + (fails ? "throw new Error('bloqueado');" : "return { token: 'prueba-app-check' };") + ' };' });
        if (u.hostname === 'firestore.googleapis.com') { heads.push(r.request().headers()['x-firebase-appcheck'] || ''); return restLinks(store)(r); }
        return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
      });
      const pg = await x.newPage();
      const st = store.db.get('enlaces/' + id);
      if (st) st.exp.__ts = Date.now() + 864e5; // vuelve a estar vigente para esta prueba
      await pg.goto(url);
      await pg.waitForTimeout(1500);
      const seen = /Hi John!/.test(await pg.evaluate(() => document.body.innerText));
      await x.close();
      return { heads, seen };
    };
    const withAc = await appCheck(false);
    ok('11b · con App Check: la página manda su prueba a Firebase al abrir el enlace', withAc.heads[0] === 'prueba-app-check' && withAc.seen, JSON.stringify(withAc));
    const noAc = await appCheck(true);
    ok('11c · si App Check falla, el enlace se abre igual (sin la prueba)', noAc.heads[0] === '' && noAc.seen, JSON.stringify(noAc));

    // Borrar el servicio borra su enlace
    await page.click('[data-close]');
    await page.click('.tabs button[data-v="tr"]');
    await page.waitForTimeout(300);
    await page.click('#ls [data-ds="s1"]');
    await page.waitForTimeout(800);
    ok('12 · al borrar el servicio, su enlace se borra de la nube', !store.db.has('enlaces/' + id));

    // Mientras Firebase tenga aún las reglas de antes: el enlace sale corto igual (formato de antes)
    linkRule.old = true;
    await page.evaluate(async (st) => { const m = await import('/js/store.js'); m.S.srv.push({ ...st.srv[0], id: 's3', lk: undefined, pa: 'Ana Ruiz' }); m.save(); }, STATE);
    await page.click('.tabs button[data-v="tr"]');
    await page.waitForTimeout(600);
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    await page.waitForTimeout(300);
    await page.click('#ls [data-lnk="s3"]');
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 8000 });
    const oldUrl = (await page.getAttribute('#lkview', 'href')).replace('?vista=1', '');
    const oldDoc = store.db.get('enlaces/' + oldUrl.split('#')[1]);
    ok('12b · con las reglas de Firebase de antes, el enlace sigue saliendo corto (formato de antes)', /#[A-Za-z0-9]{20}$/.test(oldUrl) && oldDoc && oldDoc.o === 'u1', oldUrl.slice(-30));
    linkRule.old = false;
    await page.click('.bsheet [data-close]');

    // Sin conexión: enlace largo (no te quedas sin poder mandarlo)
    await page.evaluate(async (st) => { const m = await import('/js/store.js'); m.S.srv.push({ ...st.srv[0], id: 's2', lk: undefined }); m.save(); }, STATE);
    await page.click('.tabs button[data-v="pa"]');
    await page.waitForTimeout(600);
    for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
    await page.waitForTimeout(300);
    await A.setOffline(true);
    await page.click('.pa-main');
    await page.waitForFunction(() => !document.querySelector('#lksend').classList.contains('wait'), null, { timeout: 15000 });
    const offUrl = (await page.getAttribute('#lkview', 'href')).replace('?vista=1', '');
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
