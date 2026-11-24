// Como en el iPhone: después de hablar Rutivo, el micro se queda mudo un momento
// («El micro no da sonido»). Ahora: se pide micro y altavoz a la vez
// (audioSession «play-and-record») y, si aun así se queda mudo, se recupera solo.
// Y «Oye Rutivo» dentro del asistente contesta «Dime, ¿en qué puedo ayudarte?».
// Uso: node tests/e2e/micro-iphone.e2e.cjs
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
    const ctx = await browser.newContext({ locale: 'es-ES', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', permissions: ['microphone'], viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
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
      for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
      localStorage.setItem('cajaTransfer', JSON.stringify({ mov: [], srv: [], gas: [], huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } }));
      self.__guion = ['Oye Rutivo.', 'Apúntame 20 euros en efectivo.'];
      // La opción de Safari 17 para usar micro y altavoz a la vez
      navigator.audioSession = { type: 'auto' };
      // El micro: tras hablar Rutivo, la siguiente vez llega mudo (solo silencio), como en el iPhone
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      self.__pedidos = 0;
      self.__mudo = 0;
      navigator.mediaDevices.getUserMedia = async (c) => {
        self.__pedidos++;
        if (self.__mudo > 0) { self.__mudo--; const ac = new AudioContext(); return ac.createMediaStreamDestination().stream; }
        return real(c);
      };
      // Voz de Rutivo: al terminar de hablar, el micro se queda mudo (2 veces seguidas)
      self.__dicho = [];
      const fake = {
        speaking: false, getVoices: () => [], cancel() {},
        speak(u) {
          if (u.text && u.text.trim()) self.__dicho.push(u.text);
          setTimeout(() => { if (u.onstart) u.onstart(); }, 10);
          setTimeout(async () => {
            if (u.text && u.text.trim()) {
              self.__mudo = 2;
              const m = await import('/js/microfono.js');
              const s = await m.acquireStream(); s.getTracks().forEach((t) => t.stop()); m.releaseStream(); // el sistema corta el micro
            }
            if (u.onend) u.onend();
          }, 200);
        },
      };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    });
    await page.goto(app.url);
    await page.waitForTimeout(800);
    await page.click('#asisbtn');
    const said = () => page.evaluate(() => self.__dicho.slice());
    for (let i = 0; i < 80 && !(await said()).some((t) => /ayudarte/.test(t)); i++) await page.waitForTimeout(250);
    let d = await said();
    ok('1 · «Oye Rutivo» dentro del asistente → «Dime, ¿en qué puedo ayudarte?»', d.includes('Dime, ¿en qué puedo ayudarte?'), JSON.stringify(d));
    const session = await page.evaluate(() => navigator.audioSession.type);
    ok('2 · se pide al iPhone micro y altavoz a la vez (play-and-record)', session === 'play-and-record', session);
    const requests = await page.evaluate(() => self.__pedidos);
    ok('3 · en iPhone se usa el micro de Rutivo (no se salta al teclado)', requests > 0, 'peticiones de micro: ' + requests);
    // Rutivo ha hablado → micro mudo → debe recuperarse solo y apuntar la orden siguiente
    let mov = [];
    for (let i = 0; i < 120 && !mov.length; i++) { await page.waitForTimeout(250); mov = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).mov); }
    ok('3 · tras hablar Rutivo el micro se queda mudo y se recupera solo: apunta la orden sin tocar nada', mov.length === 1 && mov[0].i === 20 && mov[0].p === 'efectivo', JSON.stringify(mov));
    const status = await page.evaluate(() => document.querySelector('.siri-status').textContent);
    ok('4 · no sale «El micro no da sonido»', !/no da sonido/.test(status), status);
    ok('5 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
