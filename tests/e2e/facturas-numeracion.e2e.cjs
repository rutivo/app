// Numeración de facturas con dos móviles: sin borrar, sin repetir con conexión,
// y aviso claro (y arreglo) si dos móviles sin conexión emiten a la vez.
// Uso: node tests/e2e/facturas-numeracion.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = (id, d) => ({ id, f: '2026-11-1' + id.slice(-1), h: '10:00', cl: 'Viajes Costa S.L.', o: 'Aeropuerto', d, i: 95, p: 'tarjeta' });
const state = (servicios) => ({ mov: [], srv: servicios, gas: [], huc: [], prv: [], jor: [], fac: [],
  cli: { 'Viajes Costa S.L.': { nif: 'B12345674', dir: 'Av. Andalucía 3' } },
  cfg: { nom: 'Antonio Ruiz', nif: '12345678Z', dir: 'C/ Larios 1', cp: '29005', loc: 'Málaga', iva: 10, facOn: 1, legal: { v: 1, at: '2026-11-20' } } });
const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')));
const sync = (page) => page.evaluate(async () => (await import('/js/cloud.js')).flush());
/** Factura los servicios `ids` como lo haría el conductor (pantalla Facturas → marcar → Crear factura). */
async function invoice(page, ids) {
  await page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
  await page.waitForTimeout(400);
  await page.evaluate((ids) => {
    const sel = document.querySelector('#fc');
    sel.value = 'Viajes Costa S.L.';
    sel.dispatchEvent(new Event('change'));
  }, ids);
  await page.waitForTimeout(200);
  await page.evaluate((ids) => document.querySelectorAll('.pick').forEach((c) => { c.checked = ids.includes(c.value); }), ids);
  const before = (await local(page)).fac.length;
  await page.evaluate(() => document.querySelector('#mk').click());
  for (let i = 0; i < 60 && (await local(page)).fac.length === before; i++) await page.waitForTimeout(200);
  await page.evaluate(() => { const c = document.querySelector('#cl'); if (c) c.click(); });
  const fac = (await local(page)).fac;
  return fac[fac.length - 1];
}

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    const A = await device(browser, app, store, { local: state([srv('s1', 'Marbella'), srv('s3', 'Nerja')]), name: 'A' });
    await wait(3000);
    const B = await device(browser, app, store, { local: state([srv('s2', 'Mijas'), srv('s4', 'Ronda')]), name: 'B' });
    await wait(3000);

    // ---------- 1. Con conexión: el segundo móvil no repite número ----------
    const f1 = await invoice(A.page, ['s1']);
    await sync(A.page);
    const f2 = await invoice(B.page, ['s2']); // B aún no había bajado la factura de A
    ok('1 · con conexión, cada móvil da el número siguiente al de la nube (no repite)', f1 && f2 && f1.num === '001' && f2.num === '002', (f1 && f1.num) + ' y ' + (f2 && f2.num));
    await sync(B.page); await sync(A.page);

    // ---------- 2. Las facturas emitidas no se pueden borrar ----------
    await A.page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await A.page.waitForTimeout(300);
    const delButtons = await A.page.evaluate(() => document.querySelectorAll('#lfac [data-df], #lfac button.x').length);
    ok('2 · en la lista de facturas ya no hay botón de borrar', delButtons === 0, delButtons + ' botones');

    // ---------- 3. Los dos sin conexión emiten a la vez: número repetido ----------
    await A.setOffline(true); await B.setOffline(true);
    const fa = await invoice(A.page, ['s3']);
    const fb = await invoice(B.page, ['s4']);
    ok('3 · sin conexión los dos emiten (no se bloquea el trabajo)', fa && fb && fa.num === fb.num, (fa && fa.num) + ' y ' + (fb && fb.num));
    await A.setOffline(false); await B.setOffline(false);
    await sync(A.page); await sync(B.page); await sync(A.page);
    await A.page.evaluate(() => document.querySelector('.tabs button[data-v="hoy"]').click());
    await A.page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await A.page.waitForTimeout(500);
    const warn = await A.page.evaluate(() => { const b = document.querySelector('#facdup'); return b && !b.hidden ? b.textContent : ''; });
    const tags = await A.page.evaluate(() => [...document.querySelectorAll('#lfac .tag')].filter((t) => /repetido/.test(t.textContent)).length);
    ok('4 · al volver la conexión, avisa claramente del número repetido y cómo arreglarlo', /número repetido/.test(warn) && /Anular/.test(warn), warn.slice(0, 90));
    ok('5 · y marca las dos facturas afectadas', tags === 2, tags + ' marcadas');

    // ---------- 4. Arreglo: anular la más reciente y volver a emitirla ----------
    const fac = (await local(A.page)).fac;
    const dupNum = fa.num;
    const newer = fac.filter((f) => f.num === dupNum && (!f.tipo || f.tipo === 'F1')).sort((x, y) => Date.parse(y.gen) - Date.parse(x.gen))[0];
    await A.page.evaluate((id) => document.querySelector('#lfac [data-of="' + id + '"]').click(), newer.id);
    await A.page.waitForTimeout(500);
    const rects = async () => (await local(A.page)).fac.filter((f) => f.tipo && f.tipo !== 'F1').length;
    await A.page.evaluate(() => document.querySelector('#invanul').click());
    await A.page.waitForTimeout(600);
    ok('6a · un solo toque en «Anular» no anula: pide confirmar (antes anulaba directamente)', (await rects()) === 0, (await rects()) + ' rectificativas');
    await A.page.evaluate(() => document.querySelector('#invanul').click());
    await A.page.waitForTimeout(800);
    ok('6b · al confirmar se crea UNA rectificativa (antes podían salir dos)', (await rects()) === 1, (await rects()) + ' rectificativas');
    await A.page.evaluate(() => { const c = document.querySelector('#cl'); if (c) c.click(); });
    const freed = (await local(A.page)).srv.filter((s) => newer.items.some((i) => i.d === s.d) && !s.fid).map((s) => s.id);
    const again = await invoice(A.page, freed);
    ok('6 · anulada (con rectificativa) y vuelta a emitir: número nuevo', again && again.num !== dupNum && +again.num > +dupNum, dupNum + ' → ' + (again && again.num));
    await sync(A.page); await sync(B.page); await sync(A.page);
    for (const [n, d] of [['A', A], ['B', B]]) {
      await d.page.evaluate(() => document.querySelector('.tabs button[data-v="hoy"]').click());
      await d.page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
      await d.page.waitForTimeout(400);
      const w = await d.page.evaluate(() => { const b = document.querySelector('#facdup'); return b && !b.hidden ? b.textContent : ''; });
      ok('7' + n + ' · en el móvil ' + n + ' el aviso desaparece', w === '', w.slice(0, 60));
    }
    const all = (await local(B.page)).fac;
    ok('8 · ninguna factura se ha perdido ni borrado (2 + 2 + rectificativa + reemitida)', all.length === 6, all.map((f) => f.num).join(','));
    ok('9 · sin errores', !A.page.errors.length && !B.page.errors.length, [...A.page.errors, ...B.page.errors].join(' | '));
    await A.ctx.close(); await B.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
