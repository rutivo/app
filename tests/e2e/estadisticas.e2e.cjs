// Panel de estadísticas de la Caja: justo debajo de la tarjeta del mes, cifras
// que cuadran con los apuntes, selectores, tocar barras, categorías con sus
// apuntes y tickets, tablas, iPhone y escritorio, sin errores en consola.
// Uso: node tests/e2e/estadisticas.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const day = (n) => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };
const r2 = (n) => Math.round(n * 100) / 100;

// Apuntes de ejemplo (fechas relativas a hoy). Las cifras esperadas se calculan aquí, aparte de la app.
const mov = [];
for (let k = 0; k < 400; k += 1) {
  if (k % 7 === 3) continue; // un día a la semana libre
  mov.push({ id: 'i' + k, f: day(k), t: 'in', p: k % 2 ? 'efectivo' : 'tarjeta', i: 40 + (k % 5) * 10, c: 'Carrera' });
  if (k % 4 === 0) mov.push({ id: 'g' + k, f: day(k), t: 'out', p: 'tarjeta', i: 55, c: 'Gasolina: Repsol' });
  if (k % 9 === 0) mov.push({ id: 'p' + k, f: day(k), t: 'out', p: 'efectivo', i: 6.5, c: 'Peaje AP-7' });
}
mov.push({ id: 'tall', f: day(2), t: 'out', p: 'tarjeta', i: 320, c: 'Taller' });
const gas = [{ id: 'tk1', mid: 'g0', f: day(0), i: 55, l: 38, p: 'tarjeta', s: 'Repsol', ph: 1 }];
const STATE = { mov, srv: [], gas, huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } };
const sumIf = (fn) => r2(mov.filter(fn).reduce((a, m) => a + (m.t === 'in' ? m.i : -m.i), 0));
const monthNet = sumIf((m) => m.f.slice(0, 7) === TODAY.slice(0, 7) && m.f <= TODAY);
const yearInc = r2(mov.filter((m) => m.t === 'in' && m.f.slice(0, 4) === TODAY.slice(0, 4)).reduce((a, m) => a + m.i, 0));
const eurNum = (s) => Number(String(s).replace(/[^\d,-]/g, '').replace(',', '.'));

async function open(browser, app, opts) {
  const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', ...opts });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
    return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('consola: ' + m.text()); });
  await page.addInitScript((st) => {
    for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
    if (!localStorage.getItem('cajaTransfer')) localStorage.setItem('cajaTransfer', JSON.stringify(st));
  }, STATE);
  await page.goto(app.url);
  await page.waitForTimeout(1200);
  return { ctx, page };
}

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // ---------- iPhone ----------
    const { ctx, page } = await open(browser, app, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const order = await page.evaluate(() => { const all = [...document.querySelectorAll('#v-hoy .card, #v-hoy details')].map((e) => e.id || e.tagName); const i = all.indexOf('graf'); return [all[i - 1], all[i + 1]]; });
    ok('1 · el panel va justo después de apuntar ingresos y gastos y de los movimientos del día', order[0] === 'lm', JSON.stringify(order));
    const seq = await page.evaluate(() => ['#mes', '#fm', '#lm', '#graf', '#lmes'].map((q) => Math.round(document.querySelector(q).getBoundingClientRect().top + window.scrollY)));
    ok('2 · orden: resumen del mes → apuntar ingreso/gasto → movimientos del día → estadísticas → todos los meses', seq.every((v, i) => i === 0 || v > seq[i - 1]), JSON.stringify(seq));

    // Cifras clave frente a las calculadas aparte
    const k = await page.evaluate(() => [...document.querySelectorAll('#graf .kp')].map((x) => [x.querySelector('.kp-l').textContent, x.querySelector('.kp-v').textContent]));
    const km = k.find((x) => /este mes/.test(x[0]));
    const ky = k.find((x) => /^Ingresos/.test(x[0]));
    ok('3 · «Limpio este mes» coincide con los apuntes', km && Math.abs(eurNum(km[1]) - monthNet) < 1, (km && km[1]) + ' vs ' + monthNet);
    ok('4 · «Ingresos del año» coincide con los apuntes', ky && Math.abs(eurNum(ky[1]) - yearInc) < 1, (ky && ky[1]) + ' vs ' + yearInc);
    ok('5 · hay 6 cifras clave (mes, año, ingresos, gastos, media por día trabajado, mejor mes)', k.length === 6, k.map((x) => x[0]).join(' | '));

    // Selector semanas / meses / años
    const count = () => page.evaluate(() => document.querySelectorAll('#graf .ch-col[data-ch="net"]').length);
    ok('6 · por defecto, 12 meses', (await count()) === 12);
    await page.click('#graf [data-chu="sem"]');
    ok('7 · «Semanas»: 8 semanas', (await count()) === 8);
    const partial = await page.evaluate(() => [document.querySelector('#graf .ch-read .pill').textContent, document.querySelectorAll('#graf .ch-col[data-ch="net"] .ch-bar.part').length]);
    ok('8 · la semana actual se marca «en curso» (rayada) y no como completa', /en curso/.test(partial[0]) && partial[1] === 1, JSON.stringify(partial));
    await page.click('#graf [data-chu="ano"]');
    const years = await count();
    ok('9 · «Años»: los años con datos', years >= 2 && years <= 5, years + ' años');
    await page.click('#graf [data-chu="mes"]');

    // Tocar una barra: datos exactos del periodo, tooltip, y el análisis de gastos de ese periodo
    await page.click('#graf .ch-col[data-ch="net"][data-i="9"]');
    const sel = await page.evaluate(() => ({ title: document.querySelector('#graf .ch-rt b').textContent, tip: !!document.querySelector('#graf .ch-col.on .ch-tip'), exp: document.querySelector('#graf .dash-card:nth-of-type(2) h4').textContent, cmp: document.querySelector('#graf .ch-rc').textContent }));
    ok('10 · tocar una barra muestra ese mes con su importe encima', sel.tip && /\d{4}/.test(sel.title), JSON.stringify(sel));
    ok('11 · …y su comparación con el mes anterior (▲/▼ %)', /(▲|▼) .*%/.test(sel.cmp) || /sin dato/.test(sel.cmp), sel.cmp);
    ok('12 · el análisis de gastos pasa a ese mismo mes', sel.exp.includes(sel.title), sel.exp);

    // Categorías: importes y %; tocar una muestra sus apuntes; la gasolina con ticket
    await page.click('#graf .ch-col[data-ch="net"][data-i="11"]');
    const cats = await page.evaluate(() => [...document.querySelectorAll('#graf .cat-row')].map((b) => b.textContent));
    ok('13 · gastos por categoría con importe y %', cats.length >= 2 && cats.every((t) => /€/.test(t) && /%/.test(t)), cats.join(' | '));
    await page.click('#graf .cat-row[data-cat="gasolina"]');
    const items = await page.evaluate(() => document.querySelectorAll('#graf .cat.open .cat-it').length);
    const monthFuel = mov.filter((m) => m.t === 'out' && /Gasolina/.test(m.c) && m.f.slice(0, 7) === TODAY.slice(0, 7)).length;
    ok('14 · tocar «Gasolina» muestra sus apuntes (todos los del mes)', items === Math.min(30, monthFuel), items + ' de ' + monthFuel);
    await page.evaluate(async () => { const s = await import('/js/store.js'); await s.savePhotoLocal('tk1', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='); });
    const hasTicket = await page.$('#graf [data-ticket="tk1"]');
    if (hasTicket) await hasTicket.click();
    await page.waitForTimeout(400);
    const ticket = await page.evaluate(() => [document.querySelector('#ph').classList.contains('on'), (document.querySelector('#phi').getAttribute('src') || '').slice(0, 22)]);
    ok('15 · y el gasto con foto tiene «🧾 Ticket», que abre la foto', !!hasTicket && ticket[0] && ticket[1].startsWith('data:image/png'), JSON.stringify(ticket));
    await page.evaluate(() => document.querySelector('#phx').click());

    // Días: mejor y peor, periodo indicado
    const days = await page.evaluate(() => [document.querySelector('[data-days]').textContent, [...document.querySelectorAll('#graf .ch-note')].map((n) => n.textContent).find((t) => /días trabajados/.test(t))]);
    ok('16 · qué días rindes más: mejor y peor día', /Mejor/.test(days[0]) && /Peor/.test(days[0]), days[0]);
    ok('17 · se indica el periodo de las medias y que los días sin ingresos no cuentan', /\(90 días\)/.test(days[1] || '') && /no cuenta como trabajado/.test(days[1] || ''), days[1]);

    // Tablas, animación, sin desbordes en iPhone
    const tables = await page.evaluate(() => document.querySelectorAll('#graf details.ch-tab table').length);
    ok('18 · cada gráfica se puede ver en tabla', tables >= 2, tables + ' tablas');
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('#graf .ch-anim .ch-bar')).animationName);
    ok('19 · las barras entran con una animación suave', anim === 'barIn', anim);
    const over = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, [...document.querySelectorAll('#graf *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length]);
    if (over[2]) console.log(await page.evaluate(() => [...document.querySelectorAll('#graf *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + e.className + ' r=' + Math.round(e.getBoundingClientRect().right) + ' w=' + Math.round(e.getBoundingClientRect().width))));
    ok('20 · en iPhone nada se sale de la pantalla', over[0] <= over[1] && over[2] === 0, JSON.stringify(over));
    ok('21 · sin errores en consola (iPhone)', !page.errors.length, page.errors.join(' | '));
    await page.screenshot({ path: process.env.CAPTURA || '/dev/null', fullPage: false }).catch(() => {});
    await ctx.close();

    // ---------- Escritorio ----------
    const d = await open(browser, app, { viewport: { width: 1280, height: 900 } });
    const dOver = await d.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, document.querySelectorAll('#graf .kp').length]);
    ok('22 · en escritorio también (sin desbordes, cifras en 3 columnas)', dOver[0] <= dOver[1] && dOver[2] === 6, JSON.stringify(dOver));
    ok('23 · sin errores en consola (escritorio)', !d.page.errors.length, d.page.errors.join(' | '));
    await d.ctx.close();

    // ---------- En inglés ----------
    const e = await open(browser, app, { viewport: { width: 390, height: 844 } });
    await e.page.evaluate(() => { localStorage.setItem('idioma', 'en'); });
    await e.page.reload();
    await e.page.waitForTimeout(1200);
    const en = await e.page.evaluate(() => document.querySelector('#graf').innerText);
    ok('24 · en inglés el panel está en inglés', /Statistics/.test(en) && /Profit trend/.test(en) && /Which days pay best/.test(en) && !/Evolución/.test(en), en.slice(0, 80));
    ok('25 · sin errores (inglés)', !e.page.errors.length, e.page.errors.join(' | '));
    await e.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
