// Asistente «secretario» en la app de verdad: conversación con memoria, forma de
// pago, repartos, correcciones, no duplicar, quitar con confirmación, gasolina
// en su pantalla, consultas con los datos reales, «Parar», ir a una pantalla y
// que todo llega a TU cuenta (y a ninguna otra). Y si no se puede guardar, no
// dice que está apuntado.
// Uso: node tests/e2e/secretario.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const state = { mov: [], srv: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };

// Voz de prueba: apunta lo que diría Rutivo y deja ver si se le manda callar
const FAKE_VOICE = () => {
  localStorage.setItem('asisOido', '0'); // sin el reconocedor de 77 MB: se escribe (como el dictado del teclado)
  localStorage.setItem('asisDictado', '1');
  self.__dicho = [];
  self.__callado = 0;
  const fake = {
    speaking: false, getVoices: () => [],
    cancel() { self.__callado++; if (this.cur) { const u = this.cur; this.cur = null; this.speaking = false; if (u.onend) u.onend(); } },
    speak(u) {
      if (u.text && u.text.trim()) self.__dicho.push(u.text);
      this.cur = u; this.speaking = true;
      setTimeout(() => { if (u.onstart) u.onstart(); }, 10);
      setTimeout(() => { if (this.cur === u) { this.cur = null; this.speaking = false; if (u.onend) u.onend(); } }, self.__largo ? 8000 : 150);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};

const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')));
const said = (page) => page.evaluate(() => self.__dicho.slice());
const lastSaid = async (page) => { const d = await said(page); return d[d.length - 1] || ''; };
async function say(page, text) {
  const n = (await said(page)).length;
  if (await page.locator('.siri-form').evaluate((el) => el.hidden)) await page.click('[data-skb]');
  await page.fill('.siri-form input', text);
  await page.press('.siri-form input', 'Enter');
  for (let i = 0; i < 30 && (await said(page)).length === n; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(250);
  return lastSaid(page);
}
async function openAssistant(page) {
  await page.click('#asisbtn');
  await page.waitForSelector('.siri .siri-orb');
}

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    const A = await device(browser, app, store, { local: state, name: 'A' });
    const page = A.page;
    await page.addInitScript(FAKE_VOICE);
    await page.reload();
    await wait(2500);
    await openAssistant(page);

    // ---------- 1. Pregunta solo lo que falta ----------
    let s = await say(page, 'Añade 50 euros de un servicio');
    ok('1 · «Añade 50 euros de un servicio» → pregunta «¿Lo has cobrado en efectivo o con tarjeta?»', s === '¿Lo has cobrado en efectivo o con tarjeta?', s);
    ok('2 · y aún no ha apuntado nada', (await local(page)).mov.length === 0);
    s = await say(page, 'En efectivo');
    let mov = (await local(page)).mov;
    ok('3 · «En efectivo» → apunta un servicio de 50 € en efectivo y lo dice', mov.length === 1 && mov[0].i === 50 && mov[0].p === 'efectivo' && mov[0].t === 'in' && mov[0].c === 'Servicio' && mov[0].f === today && /^Perfecto\. Apuntado: 50 euros en efectivo/.test(s), s + ' · ' + JSON.stringify(mov));

    // ---------- 2. Corregir ----------
    s = await say(page, 'No, eran 45, no 50');
    mov = (await local(page)).mov;
    ok('4 · «No, eran 45, no 50» → corrige ese mismo apunte (no crea otro)', mov.length === 1 && mov[0].i === 45, s + ' · ' + JSON.stringify(mov));

    // ---------- 3. Memoria: la mitad en cada uno ----------
    s = await say(page, 'He ganado 100 euros');
    ok('5 · «He ganado 100 euros» → pregunta cómo', /efectivo o con tarjeta/.test(s), s);
    s = await say(page, 'La mitad en cada uno');
    mov = (await local(page)).mov;
    const two = mov.slice(1).map((m) => m.i + ' ' + m.p).join(' + ');
    ok('6 · «La mitad en cada uno» → 50 € en efectivo y 50 € con tarjeta', two === '50 efectivo + 50 tarjeta', two + ' · ' + s);

    // ---------- 4. Gasolina: también en su pantalla ----------
    s = await say(page, 'Apunta 25 euros de gasolina con tarjeta');
    let L = await local(page);
    const g = L.gas[0];
    const gm = g && L.mov.find((m) => m.id === g.mid);
    ok('7 · «Apunta 25 euros de gasolina» → ticket en Gasolina enlazado con el gasto de la caja', L.gas.length === 1 && g.i === 25 && g.p === 'tarjeta' && gm && gm.t === 'out' && gm.i === 25, JSON.stringify(L.gas));

    // ---------- 5. No duplicar ----------
    s = await say(page, 'Apunta 25 euros de gasolina con tarjeta');
    ok('8 · repetir la misma orden → «Eso ya lo he apuntado… ¿Lo apunto otra vez?»', /ya lo he apuntado/.test(s) && (await local(page)).gas.length === 1, s);
    s = await say(page, 'no');
    L = await local(page);
    ok('9 · «no» → no se duplica', L.gas.length === 1 && L.mov.length === 4, s);

    // ---------- 6. Quitar: pregunta antes ----------
    s = await say(page, 'Borra lo último');
    L = await local(page);
    ok('10 · «Borra lo último» → pregunta antes de quitar (y aún no ha quitado nada)', /^¿Quito el gasto de 25 euros con tarjeta\?$/.test(s) && L.gas.length === 1 && L.mov.length === 4, s);
    s = await say(page, 'Sí');
    L = await local(page);
    ok('11 · «Sí» → quita el gasto de la caja y el ticket de Gasolina', L.gas.length === 0 && L.mov.length === 3 && /lo he quitado/.test(s), s);

    // ---------- 7. Consultas con los datos reales ----------
    s = await say(page, '¿Cuánto tengo en efectivo?');
    ok('12 · «¿Cuánto tengo en efectivo?» → 95 € (45 + 50 de hoy)', /llevas 95 euros en efectivo/.test(s), s);
    s = await say(page, '¿Cuánto llevo ganado hoy?');
    ok('13 · «¿Cuánto llevo ganado hoy?» → 145 € limpios', /Hoy llevas 145 euros limpios/.test(s), s);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.siri-msg')].length);
    ok('14 · el historial de la conversación se ve en pantalla', shown >= 20, shown + ' mensajes');

    // ---------- 8. Parar mientras habla ----------
    await page.evaluate(() => { self.__largo = 1; });
    // Consulta síncrona y breve: aislar la prueba del botón de cualquier cálculo asíncrono.
    await page.fill('.siri-form input', '¿Cuánto tengo en efectivo?');
    await page.press('.siri-form input', 'Enter');
    await page.waitForFunction(() => {
      const root = document.querySelector('.siri');
      const stop = document.querySelector('[data-sstop]');
      return root?.dataset.state === 'speaking' && stop?.getClientRects().length > 0 &&
        getComputedStyle(stop).visibility === 'visible';
    }, null, { timeout: 5000 });
    const st1 = await page.evaluate(() => document.querySelector('.siri').dataset.state);
    const before = await page.evaluate(() => self.__callado);
    // Activar el botón en el mismo tick en que se comprueba visible evita una carrera del locator
    // con el temporizador de voz simulado; sigue ejecutando el listener real del botón.
    await page.evaluate(() => document.querySelector('[data-sstop]')?.click());
    await page.waitForTimeout(200);
    const st2 = await page.evaluate(() => [document.querySelector('.siri').dataset.state, self.__callado]);
    ok('15 · mientras responde se ve «Parar» y al tocarlo se calla', st1 === 'speaking' && st2[0] === 'idle' && st2[1] > before, st1 + ' → ' + st2.join(','));
    await page.evaluate(() => { self.__largo = 0; });

    // ---------- 9. En tu cuenta, y en ninguna otra ----------
    await page.evaluate(async () => (await import('/js/cloud.js')).flush());
    await wait(800);
    const docs = Object.values(store.docsOf('u1')).map((d) => d.j || '').join(' ');
    const others = store.state.writes.filter((p) => !p.startsWith('users/u1/'));
    ok('16 · lo apuntado por voz llega a la cuenta del usuario (con las mismas reglas)', /"i":45/.test(docs) && /"p":"tarjeta"/.test(docs), docs.slice(0, 80));
    ok('17 · no escribe nada fuera de users/{su usuario}', store.state.writes.length > 0 && others.length === 0, others.join(','));

    // ---------- 10. Ir a una pantalla ----------
    await say(page, 'abre la gasolina');
    await page.waitForTimeout(300);
    const nav = await page.evaluate(() => [!!document.querySelector('.siri'), document.querySelector('.tabs button.on').dataset.v]);
    ok('18 · «abre la gasolina» → cierra el asistente y abre Gasolina', !nav[0] && nav[1] === 'ga', JSON.stringify(nav));
    ok('19 · sin errores', !page.errors.length, page.errors.join(' | '));
    await A.ctx.close();

    // ---------- 11. Si no se puede guardar, no dice «apuntado» ----------
    const ctx = await browser.newContext({ locale: 'es-ES' });
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
      return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
    });
    const p2 = await ctx.newPage();
    const errs = [];
    p2.on('pageerror', (e) => errs.push(e.message));
    await p2.addInitScript((st) => {
      for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
      if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st));
    }, state);
    await p2.addInitScript(FAKE_VOICE);
    await p2.goto(app.url);
    await p2.waitForTimeout(1500);
    await openAssistant(p2);
    await p2.evaluate(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'cajaTransfer') throw new DOMException('lleno', 'QuotaExceededError'); return real.call(this, k, v); }; });
    s = await say(p2, 'apunta 30 euros en efectivo');
    const html = await p2.evaluate(() => [...document.querySelectorAll('.siri-msg.rutivo')].pop().textContent);
    const inMemory = await p2.evaluate(async () => (await import('/js/store.js')).S.mov.length);
    ok('20 · móvil sin espacio: dice «No está apuntado» (nunca «apuntado» si no se guardó)', /No está apuntado/.test(s) && /No está apuntado/.test(html) && !/^Apuntado/.test(s), s);
    ok('21 · y no queda nada a medias en la app', inMemory === 0, inMemory + ' apuntes');
    ok('22 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
