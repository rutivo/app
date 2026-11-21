// «Oye Rutivo» en la pantalla principal → «Dime, ¿en qué puedo ayudarte?» →
// «Apúntame 20 como gasto con tarjeta» → lo apunta y lo confirma en voz alta.
// Navegador real con micro simulado y la regla de audio del iPhone (solo arranca
// dentro de un toque). El reconocedor de voz se sustituye por uno que «oye» un
// guion fijo (el de verdad pesa 77 MB y no hace falta para probar el flujo).
// Uso: node tests/e2e/manoslibres.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };

// Reconocedor de prueba: cada frase grabada «se oye» como la siguiente del guion
const OIDO = `
export const earSupported = () => true;
export async function prepareEar() {}
export async function transcribe(audio, ms, opts) {
  self.__frases = (self.__frases || 0) + 1;
  self.__topes = (self.__topes || []).concat(opts && opts.maxTokens ? [opts.maxTokens] : []);
  if (self.__lento) {
    // Como un iPhone real: tarda en entender. ¿Sigue grabando el micro mientras tanto?
    const m = await import('/js/microfono.js');
    await new Promise((r) => setTimeout(r, self.__lento / 2));
    (self.__oyendo = self.__oyendo || []).push(m.isCapturing());
    await new Promise((r) => setTimeout(r, self.__lento / 2));
  }
  return (self.__guion || []).shift() || '';
}
`;

async function run(browser, app, guion, lento = 0) {
  const ctx = await browser.newContext({ locale: 'es-ES', permissions: ['microphone'], viewport: { width: 400, height: 860 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
    if (u.pathname.endsWith('/js/oido.js')) return r.fulfill({ contentType: 'text/javascript', body: OIDO });
    return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(({ guion, lento }) => {
    for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '1']]) localStorage.setItem(k, v);
    localStorage.setItem('cajaTransfer', JSON.stringify({ mov: [], srv: [], gas: [], huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } }));
    self.__guion = guion.slice();
    self.__lento = lento;
    // Regla de Safari en iPhone: el audio solo arranca dentro de un toque
    let inGesture = false;
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => { inGesture = true; setTimeout(() => { inGesture = false; }, 0); }, { capture: true });
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...a) { super(...a); if (!inGesture) super.suspend(); }
      resume() { return inGesture ? super.resume() : new Promise(() => {}); }
    };
    // Lo que dice Rutivo en voz alta
    self.__dicho = [];
    const fake = {
      speaking: false, getVoices: () => [], cancel() {},
      speak(u) { self.__dicho.push(u.text); setTimeout(() => { if (u.onstart) u.onstart(); setTimeout(() => u.onend && u.onend(), 200); }, 20); },
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  }, { guion, lento });
  await page.goto(app.url);
  await page.waitForTimeout(800);
  return { ctx, page };
}

const movs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).mov);
const said = (page) => page.evaluate(() => self.__dicho.filter((t) => t.trim())); // sin el sonido mudo que desbloquea la voz en iPhone
const waitFor = async (page, fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await page.waitForTimeout(300); } return false; };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    // ---------- 1. Gasto con tarjeta ----------
    let { ctx, page } = await run(browser, app, ['Oye Rutivo', 'Apúntame 20 como gasto con tarjeta']);
    await page.mouse.click(200, 300); // un toque cualquiera en la pantalla principal
    await waitFor(page, async () => (await said(page)).some((t) => /ayudarte/.test(t)));
    let d = await said(page);
    ok('1 · al decir «Oye Rutivo» en la pantalla principal contesta «Dime, ¿en qué puedo ayudarte?»', d[0] === 'Dime, ¿en qué puedo ayudarte?', JSON.stringify(d));
    ok('2 · sin abrir el asistente (solo el globo pequeño)', !(await page.$('.siri')) && !!(await page.$('.hf')));
    await waitFor(page, async () => (await movs(page)).length > 0);
    let m = await movs(page);
    ok('3 · «Apúntame 20 como gasto con tarjeta» → gasto de 20 € con tarjeta', m.length === 1 && m[0].t === 'out' && m[0].i === 20 && m[0].p === 'tarjeta', JSON.stringify(m));
    await waitFor(page, async () => (await said(page)).length >= 2, 8000);
    d = await said(page);
    ok('4 · y lo confirma en voz alta', /Gasto apuntado: 20 euros con tarjeta/.test(d[1] || ''), JSON.stringify(d));
    ok('5 · el apunte se ve en la caja', /20,00/.test(await page.innerText('body')));
    ok('6 · sin errores', !page.errors.length, page.errors.join(' | '));
    await ctx.close();

    // ---------- 2. Ingreso en efectivo, y de un tirón ----------
    ({ ctx, page } = await run(browser, app, ['Oye Rutivo', 'Apúntame esto en ingreso de 30 en efectivo', 'Oye Rutivo, apúntame 12 euros de gasto en efectivo']));
    await page.mouse.click(200, 300);
    await waitFor(page, async () => (await movs(page)).length > 0);
    m = await movs(page);
    ok('7 · «Apúntame esto en ingreso de 30 en efectivo» → ingreso de 30 € en efectivo', m.length === 1 && m[0].t === 'in' && m[0].i === 30 && m[0].p === 'efectivo' && m[0].c !== 'Esto', JSON.stringify(m));
    // Vuelve a esperar «Oye Rutivo» solo, sin tocar nada
    await waitFor(page, async () => (await movs(page)).length > 1);
    m = await movs(page);
    ok('8 · después vuelve a escuchar solo: «Oye Rutivo, apúntame 12 de gasto» de un tirón', m.length === 2 && m[1].t === 'out' && m[1].i === 12 && m[1].p === 'efectivo', JSON.stringify(m));
    ok('9 · sin errores', !page.errors.length, page.errors.join(' | '));
    await ctx.close();

    // ---------- 3. Como en un iPhone: entender cada frase tarda 3 s ----------
    ({ ctx, page } = await run(browser, app, ['música de la radio', 'Oye Rutivo', 'Apúntame 15 como gasto en efectivo'], 3000));
    await page.mouse.click(200, 300);
    await waitFor(page, async () => (await movs(page)).length > 0, 60000);
    const oyendo = await page.evaluate(() => self.__oyendo || []);
    ok('10 · mientras entiende una frase, el micro SIGUE grabando (antes se quedaba sordo y «Oye Rutivo» se perdía)', oyendo.length > 0 && oyendo.some(Boolean), JSON.stringify(oyendo));
    m = await movs(page);
    ok('11 · con un reconocedor lento también funciona: gasto de 15 € en efectivo', m.length === 1 && m[0].t === 'out' && m[0].i === 15 && m[0].p === 'efectivo', JSON.stringify(m));
    const topes = await page.evaluate(() => self.__topes || []);
    ok('12 · la escucha de fondo pide respuestas cortas (más rápida con ruido)', topes.length > 0 && topes.every((t) => t <= 30), JSON.stringify(topes));
    ok('13 · sin errores', !page.errors.length, page.errors.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
