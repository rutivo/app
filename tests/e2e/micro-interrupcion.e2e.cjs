// Como en el iPhone cuando llega un WhatsApp: el audio de la app queda
// interrumpido y ya no vuelve ni reanudándolo con un toque. Ahora, al tocar la
// bola, el audio y el micro se rehacen de cero y Rutivo vuelve a oír.
// Uso: node tests/e2e/micro-interrupcion.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const OIDO = `
export const earSupported = () => true;
export async function prepareEar() {}
export async function transcribe() { return (self.__guion || []).shift() || ''; }
`;

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ctx = await browser.newContext({ locale: 'es-ES', permissions: ['microphone'], viewport: { width: 400, height: 860 } });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      if (u.pathname.endsWith('/js/oido.js')) return r.fulfill({ contentType: 'text/javascript', body: OIDO });
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(() => {
      for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0'], ['asisVoz', '0']]) localStorage.setItem(k, v);
      localStorage.setItem('cajaTransfer', JSON.stringify({ mov: [], srv: [], gas: [], huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } }));
      self.__guion = [];
      // Llevar la cuenta de los audios creados y poder «interrumpirlos» como el iPhone
      const Real = window.AudioContext;
      self.__ctxs = [];
      window.AudioContext = class extends Real {
        constructor(...a) { super(...a); self.__ctxs.push(this); this.__roto = false; }
        resume() { return this.__roto ? new Promise(() => {}) : super.resume(); } // interrumpido: ni con un toque vuelve
      };
    });
    await page.goto(app.url);
    await page.waitForTimeout(800);
    const movs = () => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).mov);
    const waitMov = async (n) => { for (let i = 0; i < 80 && (await movs()).length < n; i++) await page.waitForTimeout(250); return (await movs()).length; };

    // 1. Funciona
    await page.evaluate(() => { self.__guion.push('Apúntame 20 euros en efectivo'); });
    await page.click('#asisbtn');
    ok('1 · antes de la notificación, apunta por voz', (await waitMov(1)) === 1);
    await page.waitForTimeout(800);

    // 2. Llega un WhatsApp: el audio queda interrumpido (no vuelve ni con un toque)
    await page.evaluate(async () => { for (const c of self.__ctxs) { c.__roto = true; await c.suspend(); } });
    await page.evaluate(() => { self.__guion.push('Apúntame 30 euros con tarjeta'); });
    await page.waitForTimeout(2500); // Rutivo seguía escuchando solo: con el audio interrumpido no le llega nada
    await page.click('[data-sorb]'); // «ya he terminado»
    await page.waitForTimeout(1500);
    const st = await page.textContent('.siri-status');
    ok('2 · con el audio interrumpido no oye nada (como en tu iPhone)', (await movs()).length === 1, st);

    // 3. Tocar la bola: audio y micro de cero → vuelve a oír
    const before = await page.evaluate(() => self.__ctxs.length);
    await page.click('[data-sorb]');
    const n = await waitMov(2);
    const after = await page.evaluate(() => self.__ctxs.length);
    ok('3 · al tocar la bola, rehace el audio (uno nuevo) y vuelve a oír: apunta los 30 €', n === 2 && after > before, 'audios ' + before + ' → ' + after + ' · apuntes ' + n);
    ok('4 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
