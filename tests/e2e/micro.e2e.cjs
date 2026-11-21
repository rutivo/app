// Micrófono siempre activo con la app abierta (js/microfono.js).
// Navegador real con un micrófono simulado; el reloj se adelanta para no esperar.
// Uso: node tests/e2e/micro.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ctx = await browser.newContext({ locale: 'es-ES', permissions: ['microphone'] });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.clock.install();
    await page.addInitScript(() => {
      for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
      // Cuenta las veces que se pide el micro (en iPhone, cada una puede volver a preguntar)
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__pedidos = 0;
      navigator.mediaDevices.getUserMedia = (c) => { window.__pedidos++; return real(c); };
      // Para simular la app en segundo plano
      window.__visible = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__visible });
    });
    await page.goto(app.url);
    await page.clock.runFor(1500);
    const mic = () => page.evaluate(async () => { const m = await import('/js/microfono.js'); return { live: m.sharedLive(), pedidos: window.__pedidos }; });
    const use = () => page.evaluate(async () => {
      const { createMic } = await import('/js/microfono.js');
      const m = createMic();
      await m.open();
      m.close(); // como el asistente al cerrarse
    });
    const hide = (v) => page.evaluate((v) => { window.__visible = v; document.dispatchEvent(new Event('visibilitychange')); }, v);

    await use();
    ok('1 · se abre el micro (una petición)', (await mic()).live && (await mic()).pedidos === 1);
    await page.clock.runFor(10 * 60e3); // 10 minutos sin usarlo, con la app abierta
    let m = await mic();
    ok('2 · con la app abierta y sin usarlo 10 min: sigue activo (antes se apagaba a los 3 min)', m.live, JSON.stringify(m));
    await use(); await use(); await use();
    m = await mic();
    ok('3 · usarlo otras 3 veces no vuelve a pedir el micro', m.pedidos === 1, m.pedidos + ' petición(es)');
    await hide('hidden'); await page.clock.runFor(5 * 60e3); await hide('visible');
    m = await mic();
    ok('4 · en segundo plano un rato corto (5 min): al volver sigue activo, sin pedirlo otra vez', m.live && m.pedidos === 1, JSON.stringify(m));
    await hide('hidden'); await page.clock.runFor(16 * 60e3);
    m = await mic();
    ok('5 · en segundo plano mucho rato (16 min): se apaga (no queda abierto sin verse)', !m.live, JSON.stringify(m));
    await hide('visible');
    await use();
    m = await mic();
    ok('6 · al volver y usarlo, se abre de nuevo', m.live && m.pedidos === 2, JSON.stringify(m));
    // El sistema corta el micro (llamada, otra app…): se vuelve a abrir solo al usarlo
    await page.evaluate(async () => { const s = await navigator.mediaDevices.enumerateDevices(); return s.length; });
    await page.evaluate(async () => { const { acquireStream, releaseStream } = await import('/js/microfono.js'); const s = await acquireStream(); s.getTracks().forEach((t) => t.stop()); releaseStream(); });
    await use();
    m = await mic();
    ok('7 · si el sistema corta el micro, al usarlo se vuelve a abrir', m.live && m.pedidos === 3, JSON.stringify(m));
    ok('8 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
