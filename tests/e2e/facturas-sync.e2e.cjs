// Tarea 1: facturas antiguas y sincronización segura (navegador real + Firestore simulado).
// Uso: node tests/e2e/facturas-sync.e2e.cjs
const { chromium } = require('playwright');
const { isDeepStrictEqual } = require('util'); // mismo contenido (el orden de los campos no importa)
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGO = 'data:image/png;base64,' + 'A'.repeat(180000);
const legacy = (n, year = '2026') => ({ id: 'f' + n, num: String(n).padStart(3, '0'), fecha: year + '-03-' + String(10 + n).padStart(2, '0'), iva: 10,
  em: { nom: 'Antonio Ruiz', nif: '12345678Z', dir: 'C/ Larios 1', loc: 'Málaga', limg: LOGO, huchas: [{ id: 'h1', n: 'Mi hucha' }], wen: 'Hello' },
  cl: { nom: 'Viajes Costa S.L.', nif: 'B12345674', dir: 'Av. Andalucía 3' }, items: [{ f: year + '-03-01', h: '10:00', o: 'Aeropuerto', d: 'Marbella', i: 60, p: 'tarjeta' }] });
const state = (fac, extra = {}) => ({ mov: [{ id: 'm1', f: '2026-11-02', t: 'in', p: 'efectivo', i: 55, c: 'Carrera' }], srv: [], gas: [], huc: [], prv: [], jor: [], cli: {},
  cfg: { nom: 'Antonio Ruiz', iva: 10, nif: '12345678Z', dir: 'C/ Larios 1', loc: 'Málaga', limg: LOGO, facOn: 1, legal: { v: 1, at: '2026-11-20' } }, fac, ts: 1000, ...extra });
const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')));
const syncText = (page) => page.evaluate(() => { const e = document.querySelector('#sync'); return e && !e.hidden ? e.textContent : ''; });
const sortId = (l) => [...l].sort((a, b) => a.id.localeCompare(b.id));

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // ---------- A: 8 facturas antiguas con logo (antes: > 1 MB en un documento) ----------
    let store = createFirestore();
    const facA = [...Array.from({ length: 8 }, (_, i) => legacy(i + 1)), { ...legacy(30), id: 'nueva', num: '030', fecha: '2026-11-20', em: { nom: 'Antonio Ruiz', nif: '12345678Z', dir: 'C/ Larios 1', cp: '', loc: 'Málaga', lic: '', iban: '', ivaMot: '' } }];
    const A = await device(browser, app, store, { local: state(facA) });
    await wait(4000);
    const docs = store.docsOf('u1');
    const facKeys = Object.keys(docs).filter((k) => k.startsWith('fac-')).sort();
    console.log('   documentos de facturas en la nube:', facKeys.map((k) => k + ' (' + Math.round(Buffer.byteLength(JSON.stringify(docs[k])) / 1024) + ' KB)').join(', '));
    ok('A1 · las facturas antiguas con logo se suben repartidas en varios documentos', facKeys.length >= 2);
    ok('A2 · ningún documento pasa del límite de Firestore (1 MiB) ni de las reglas', Object.values(docs).every((d) => Buffer.byteLength(JSON.stringify(d)) <= 1048576 && (!d.j || d.j.length < 1000000)));
    ok('A3 · la marca de versión se guarda (todo subido)', docs.meta && docs.meta.ts > 0);
    ok('A4 · sin avisos de error en pantalla', (await syncText(A.page)) === '', await syncText(A.page));
    ok('A5 · las facturas del móvil no se han modificado (logo y datos originales intactos)', JSON.stringify(sortId((await local(A.page)).fac)) === JSON.stringify(sortId(facA)));
    ok('A6 · sin errores de la app', !A.page.errors.length, A.page.errors.join(' | '));

    // Otro móvil del mismo usuario recibe EXACTAMENTE las mismas facturas
    const B = await device(browser, app, store, { local: null, owner: false });
    await wait(3500);
    const facB = (await local(B.page)).fac || [];
    ok('A7 · un segundo móvil descarga las 9 facturas idénticas (ida y vuelta sin pérdidas)', isDeepStrictEqual(sortId(facB), sortId(facA)), facB.length + ' facturas');
    await B.page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await B.page.waitForTimeout(500);
    ok('A8 · las facturas antiguas se ven y se abren en el segundo móvil', /001/.test(await B.page.innerText('#lfac')) && (await B.page.evaluate(() => { document.querySelector('#lfac [data-of]').click(); return new Promise((r) => setTimeout(() => r(document.querySelector('#sheet').innerText), 400)); })).includes('Viajes Costa'));
    await A.ctx.close(); await B.ctx.close();

    // ---------- B: compatibilidad con la nube en formato antiguo (un documento por año) ----------
    store = createFirestore();
    const old = [legacy(1, '2025'), legacy(2, '2025')];
    store.db.set('users/u1/data/fac-2025', { j: JSON.stringify(old) });
    store.db.set('users/u1/data/cfg', { j: JSON.stringify({ cfg: state([]).cfg, cli: {} }) });
    store.db.set('users/u1/data/meta', { ts: 5000 });
    const C = await device(browser, app, store, { local: null, owner: false });
    await wait(3000);
    ok('B1 · lee la nube en formato antiguo sin problemas', isDeepStrictEqual(sortId((await local(C.page)).fac), sortId(old)));
    await C.ctx.close();

    // ---------- C: una factura que no cabe sola: no se sube, NO se borra de la nube, y se avisa ----------
    store = createFirestore();
    const prev = [legacy(1, '2027')];
    store.db.set('users/u1/data/fac-2027', { j: JSON.stringify(prev) });
    store.db.set('users/u1/data/meta', { ts: 500 });
    const huge = { ...legacy(2, '2027'), em: { ...legacy(2, '2027').em, limg: 'x'.repeat(950000) } };
    const D = await device(browser, app, store, { local: state([...prev, huge], { ts: 9000 }) });
    await wait(4000);
    const d2 = store.docsOf('u1');
    ok('C1 · el documento de 2027 que ya estaba en la nube no se ha tocado ni borrado', d2['fac-2027'] && d2['fac-2027'].j === JSON.stringify(prev));
    // Otro móvil (versión nueva) sincroniza: fusiona sin borrar; y este móvil vuelve a
    // sincronizar: la factura que no cabe sigue aquí (nunca se pierde)
    const D2 = await device(browser, app, store, { local: null, owner: false });
    await wait(3000);
    await D.page.evaluate(async () => (await import('/js/cloud.js')).flush());
    await wait(500);
    ok('C2 · otro móvil sincronizando no hace perder la factura que no cabe', (await local(D.page)).fac.some((f) => f.id === huge.id) && (await local(D2.page)).fac.some((f) => f.id === prev[0].id));
    await D2.ctx.close();
    const msg = await syncText(D.page);
    ok('C3 · aviso claro en la pantalla principal (no dice «sin conexión»)', /No se pudo sincronizar la factura 002/.test(msg) && !/Sin conexión/.test(msg), msg);
    ok('C4 · el resto sí se sube (caja y ajustes)', !!d2['mov-2026-11'] && !!d2.cfg);
    await D.page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await D.page.waitForTimeout(500);
    const card = await D.page.evaluate(() => { const c = document.querySelector('#facsync'); return c && !c.hidden ? c.innerText : ''; });
    ok('C5 · tarjeta de aviso en Facturas, explicando que sigue en el móvil', /Facturas sin sincronizar/.test(card) && /siguen en este móvil/.test(card), card.split('\n')[1]);
    ok('C6 · la factura va marcada «⚠️ Sin sincronizar» en la lista', /002[\s\S]*Sin sincronizar|Sin sincronizar[\s\S]*002/.test(await D.page.innerText('#lfac')));
    ok('C7 · la factura sigue en el móvil, intacta', (await local(D.page)).fac.some((f) => f.id === huge.id && f.em.limg.length === 950000));
    await D.ctx.close();

    // ---------- D: la nube rechaza un documento: se suben los demás, no se borra y se explica ----------
    store = createFirestore();
    store.state.reject.set('mov-2026-11', { code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    store.db.set('users/u1/data/mov-2026-11', { j: JSON.stringify([{ id: 'm0', f: '2026-11-01', t: 'in', p: 'efectivo', i: 1, c: 'Anterior' }]) });
    const E = await device(browser, app, store, { local: state([legacy(1)]) });
    await wait(4000);
    const d3 = store.docsOf('u1');
    const m3 = await syncText(E.page);
    ok('D1 · el documento rechazado no se borra de la nube', !!d3['mov-2026-11']);
    ok('D2 · los demás documentos sí se suben', !!d3['fac-2026'] && !!d3.cfg);
    ok('D3 · el aviso dice «permiso denegado», no «sin conexión»', /permiso denegado/.test(m3) && !/Sin conexión/.test(m3), m3);
    await E.ctx.close();

    // ---------- E: sin conexión y al volver ----------
    store = createFirestore();
    store.state.offline = true;
    const F = await device(browser, app, store, { local: state([legacy(1)]) });
    await wait(3000);
    ok('E1 · sin conexión: lo dice y no se pierde nada', /Sin conexión/.test(await syncText(F.page)) && (await local(F.page)).fac.length === 1);
    // Crear, editar y borrar sin conexión
    await F.page.evaluate(async () => {
      const { S, save } = await import('/js/store.js');
      S.mov.push({ id: 'n1', f: '2026-11-05', t: 'in', p: 'tarjeta', i: 30, c: 'Nueva' }); save();
      S.mov.find((m) => m.id === 'm1').i = 77; save();
    });
    await wait(1500);
    store.state.offline = false;
    await F.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await wait(3000);
    const d4 = store.docsOf('u1');
    const mov = [...JSON.parse((d4['mov-2026-11'] || { j: '[]' }).j), ...JSON.parse((d4['mov-2026-11'] && '[]') || '[]')];
    ok('E2 · al volver la conexión se sube lo creado y lo editado', mov.some((m) => m.id === 'm1' && m.i === 77) && !!d4['fac-2026'], JSON.stringify(mov.map((m) => m.id + ':' + m.i)));
    ok('E3 · y la nueva entrada (otro mes) también', !!d4['mov-2026-11'] && JSON.parse(d4['mov-2026-11'].j).some((m) => m.id === 'n1'));
    // Borrar una entrada y un mes entero
    await F.page.evaluate(async () => { const { S, save } = await import('/js/store.js'); S.mov = S.mov.filter((m) => m.id !== 'n1'); save(); });
    await wait(2500);
    ok('E4 · al borrar una entrada se borra también en la nube', !JSON.parse(store.docsOf('u1')['mov-2026-11'].j).some((m) => m.id === 'n1'));
    ok('E5 · sin avisos tras recuperar la conexión', (await syncText(F.page)) === '', await syncText(F.page));
    await F.ctx.close();

    // ---------- F: aislamiento entre usuarios ----------
    store = createFirestore();
    const G = await device(browser, app, store, { uid: 'u1', local: state([legacy(1)]) });
    await wait(3500);
    const H = await device(browser, app, store, { uid: 'u2', local: null, owner: false });
    await wait(3000);
    const lh = await local(H.page);
    ok('F1 · otro usuario no ve ninguna factura ni movimiento del primero', !lh || ((lh.fac || []).length === 0 && (lh.mov || []).length === 0));
    const peek = await H.page.evaluate(async () => {
      const fs = await import('/__sdk_falso/firebase-firestore.js');
      try { await fs.getDocs(fs.collection({}, 'users', 'u1', 'data')); return 'LEÍDO'; } catch (e) { return e.code; }
    });
    ok('F2 · si intenta leer los datos del otro usuario directamente, se le deniega', peek === 'permission-denied', peek);
    await G.ctx.close(); await H.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
