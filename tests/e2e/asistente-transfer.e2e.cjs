// Asistente y transfers, en la app de verdad: apuntar un transfer de palabra (con
// confirmación), deshacerlo, cobrar un servicio, abrir el enlace y un mensaje del
// cliente, preguntar por su vuelo, y callarse con «para». Todo llega a tu cuenta.
// Uso: node tests/e2e/asistente-transfer.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const madrid = (ms, o) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid', ...o });
const today = madrid(Date.now(), { year: 'numeric', month: '2-digit', day: '2-digit' });
const tomorrow = madrid(Date.now() + 864e5, { year: 'numeric', month: '2-digit', day: '2-digit' });
const NEXT = Date.now() + 4 * 36e5;
const state = {
  mov: [], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {},
  srv: [
    { id: 'a', f: madrid(NEXT, { year: 'numeric', month: '2-digit', day: '2-digit' }), h: madrid(NEXT, { hour: '2-digit', minute: '2-digit' }), cl: 'Viajes Costa', o: 'Aeropuerto de Málaga T3', d: 'Marbella', i: 95, p: 'pendiente', pa: 'John Smith', vu: 'BA490', tl: '+447700900123' },
    { id: 'c', f: '2026-11-10', h: '10:00', cl: 'SunTours', o: 'Málaga', d: 'Ronda', i: 210, p: 'pendiente', pa: 'Familia Müller' },
  ],
  cfg: { nom: 'Antonio', iva: 10, punto: 'Puerta 3', legal: { v: 1, at: '2026-11-20' } },
};

const FAKE_VOICE = () => {
  localStorage.setItem('asisOido', '0');
  localStorage.setItem('asisDictado', '1');
  self.__dicho = [];
  const fake = {
    speaking: false, getVoices: () => [],
    cancel() { if (this.cur) { const u = this.cur; this.cur = null; this.speaking = false; if (u.onend) u.onend(); } },
    speak(u) {
      if (u.text && u.text.trim()) self.__dicho.push(u.text);
      this.cur = u; this.speaking = true;
      setTimeout(() => { if (u.onstart) u.onstart(); }, 10);
      setTimeout(() => { if (this.cur === u) { this.cur = null; this.speaking = false; if (u.onend) u.onend(); } }, 150);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};
const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')));
const lastMsg = (page) => page.evaluate(() => { const m = [...document.querySelectorAll('.siri-msg.rutivo')]; return m.length ? m[m.length - 1].innerText : ''; });
async function say(page, text) {
  await page.fill('.siri-form input', text);
  await page.press('.siri-form input', 'Enter');
  await page.waitForTimeout(700);
}
async function openAssistant(page) {
  for (const b of await page.$$('button:has-text("Entendido")')) if (await b.isVisible()) await b.click();
  await page.click('#asisbtn');
  await page.waitForSelector('.siri');
  // Este flujo escribe órdenes de texto: mostrar el teclado con su botón explícito.
  await page.click('.siri [data-skb]');
  await page.waitForSelector('.siri .siri-form:not([hidden])');
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

    // ---------- Apuntar un transfer de palabra ----------
    await say(page, 'Apunta un transfer mañana a las 10 del aeropuerto a Marbella por 95 euros');
    let t = await lastMsg(page);
    ok('1 · pregunta antes de apuntar el transfer, con todo lo entendido', /¿Apunto el transfer mañana a las 10:00: Aeropuerto de Málaga T3 → Marbella · 95,00\s€/.test(t) && (await local(page)).srv.length === 2, t.slice(0, 120));
    ok('2 · y NO lo mete como dinero cobrado en la caja (antes pasaba)', (await local(page)).mov.length === 0);
    await page.click('[data-asyes]');
    await page.waitForTimeout(600);
    let L = await local(page);
    const nuevo = L.srv.find((s) => s.f === tomorrow && s.h === '10:00');
    ok('3 · al decir que sí: transfer apuntado (pendiente de cobro) y nada en la caja', nuevo && nuevo.d === 'Marbella' && nuevo.i === 95 && nuevo.p === 'pendiente' && L.mov.length === 0, JSON.stringify(nuevo));
    await wait(1500);
    ok('4 · llega a tu cuenta (nube)', /Marbella/.test(JSON.stringify(store.docsOf('u1'))) && JSON.stringify(store.docsOf('u1')).includes(tomorrow));
    await say(page, 'borra lo último');
    t = await lastMsg(page);
    ok('5 · «borra lo último» pregunta qué quita (el transfer)', /¿Quito el transfer del/.test(t), t.slice(0, 90));
    await page.click('[data-asyes]');
    await page.waitForTimeout(600);
    ok('6 · y lo quita', !(await local(page)).srv.some((s) => s.f === tomorrow && s.h === '10:00'));

    // ---------- Cobrar un servicio ----------
    await say(page, 'SunTours me ha pagado');
    t = await lastMsg(page);
    ok('7 · «SunTours me ha pagado» → pregunta cómo', /SunTours · Familia Müller.*efectivo o con tarjeta/.test(t), t.slice(0, 100));
    await say(page, 'con tarjeta');
    L = await local(page);
    const c = L.srv.find((s) => s.id === 'c');
    const m = L.mov.find((x) => x.id === c.mid);
    ok('8 · queda cobrado con tarjeta y entra en la caja de hoy (igual que desde Transfer)', c.p === 'tarjeta' && m && m.i === 210 && m.p === 'tarjeta' && m.f === today && m.t === 'in', JSON.stringify([c.p, m]));
    await say(page, 'no, en efectivo');
    L = await local(page);
    ok('9 · «no, en efectivo» lo corrige (servicio y caja)', L.srv.find((s) => s.id === 'c').p === 'efectivo' && L.mov.find((x) => x.id === c.mid).p === 'efectivo');
    await say(page, 'borra lo último');
    await page.click('[data-asyes]');
    await page.waitForTimeout(600);
    L = await local(page);
    ok('10 · deshacer el cobro: vuelve a «pendiente» y sale de la caja', L.srv.find((s) => s.id === 'c').p === 'pendiente' && !L.mov.length, JSON.stringify(L.mov));

    // ---------- Preguntar por el cliente ----------
    await say(page, '¿A qué hora es la recogida de John?');
    t = await lastMsg(page);
    ok('11 · «¿A qué hora es la recogida de John?» → su servicio (no la hora de ahora)', /John Smith: .* a las \d\d:\d\d · Aeropuerto de Málaga T3 → Marbella/.test(t), t.slice(0, 100));

    // ---------- Abrir cosas del cliente ----------
    await say(page, 'Mándale el enlace a John');
    await page.waitForTimeout(500);
    ok('12 · «Mándale el enlace a John» → se cierra el asistente y se abre su enlace', !(await page.$('.siri')) && /Enlace para John/.test(await page.evaluate(() => (document.querySelector('.bsheet h3') || {}).textContent || '')));
    await page.click('.bsheet [data-close]');
    await openAssistant(page);
    await say(page, 'Dile a John que llego en 15 minutos');
    await page.waitForTimeout(500);
    const msg = await page.inputValue('#mtx').catch(() => '');
    ok('13 · «Dile a John que llego en 15 minutos» → mensaje listo con los 15 minutos', /15 min/.test(msg) && /John/.test(msg), msg);
    await page.click('.bsheet [data-close]');
    await openAssistant(page);
    await say(page, 'llama a John');
    await page.waitForTimeout(400);
    ok('14 · «Llama a John» → botón para llamar a su número (tú tocas)', (await page.getAttribute('.bsheet a[href^="tel:"]', 'href')) === 'tel:+447700900123');
    await page.click('.bsheet [data-close]');
    await openAssistant(page);
    await say(page, 'llévame a la recogida');
    await page.waitForTimeout(400);
    ok('15 · «Llévame a la recogida» → Google Maps a la recogida', /maps\/dir\/.*Aeropuerto%20de%20M%C3%A1laga%20T3/.test(await page.getAttribute('.bsheet a.btn', 'href')));
    await page.click('.bsheet button[data-close]');

    // ---------- Callarse ----------
    await openAssistant(page);
    await say(page, 'para');
    ok('16 · «Para» → se calla y se cierra', !(await page.$('.siri')));
    ok('17 · sin errores', !page.errors.length, page.errors.join(' | '));
    await A.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
