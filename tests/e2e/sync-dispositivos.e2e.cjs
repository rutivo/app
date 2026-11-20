// Tarea 2: varios móviles sincronizando (a la vez, sin conexión, conflictos, versiones antiguas).
// Navegador real + Firestore simulado con transacciones. Uso: node tests/e2e/sync-dispositivos.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mv = (id, i, c = 'Carrera', f = '2026-11-20') => ({ id, f, t: 'in', p: 'efectivo', i, c });
const base = (mov) => ({ mov, srv: [], gas: [], huc: [], prv: [], jor: [], cli: {}, fac: [], cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } }, ts: 1000 });
const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')));
const remoteMov = (store) => JSON.parse((store.docsOf('u1')['mov-2026-11'] || { j: '[]' }).j);
const fmt = (l) => l.map((m) => m.id + ':' + m.i + ':' + m.c).sort().join(' ');
// Cambios hechos «a mano» en la app (igual que las pantallas: cambian el registro y guardan)
// (la función se construye aquí, en Node: la app no permite evaluar texto como código, por su CSP)
const edit = (page, fn, arg) => page.evaluate(new Function('a', 'return (async () => { const { S, save } = await import("/js/store.js"); (' + fn.toString() + ')(S, a); save(); })();'), arg);
const sync = (page) => page.evaluate(async () => (await import('/js/cloud.js')).flush());

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // Nube con 3 registros, sincronizados en dos móviles A y B
    const store = createFirestore();
    const A = await device(browser, app, store, { local: base([mv('x', 10), mv('y', 20), mv('z', 30)]) });
    await wait(3000);
    const B = await device(browser, app, store, { local: null, owner: false });
    await wait(3000);
    ok('0 · los dos móviles empiezan con lo mismo', fmt((await local(A.page)).mov) === fmt((await local(B.page)).mov) && remoteMov(store).length === 3);

    // ---------- 1: a la vez, cada uno añade un registro ----------
    await Promise.all([edit(A.page, (S, a) => { S.mov.push(a) }, mv('a1', 11, 'De A')), edit(B.page, (S, a) => { S.mov.push(a) }, mv('b1', 22, 'De B'))]);
    await wait(2500);
    await sync(A.page); await sync(B.page); await sync(A.page);
    const r1 = remoteMov(store).map((m) => m.id).sort().join(',');
    ok('1 · añadidos a la vez en dos móviles: se guardan los dos (nadie pisa a nadie)', r1 === 'a1,b1,x,y,z', r1);
    ok('1 · y los dos móviles ven los dos', fmt((await local(A.page)).mov) === fmt((await local(B.page)).mov), fmt((await local(A.page)).mov) + ' || ' + fmt((await local(B.page)).mov));

    // ---------- 2: escrituras exactamente a la vez (se fuerza el choque en el servidor) ----------
    let first = true;
    store.state.beforeCommit = async (body) => { if (first && body.ops[0].path.endsWith('mov-2026-11')) { first = false; await wait(1500); } };
    await edit(A.page, (S, a) => { S.mov.push(a) }, mv('a2', 12, 'A2'));
    await wait(200);
    await edit(B.page, (S, a) => { S.mov.push(a) }, mv('b2', 23, 'B2'));
    await wait(5000);
    store.state.beforeCommit = null;
    await sync(A.page); await sync(B.page);
    const r2 = remoteMov(store).map((m) => m.id).sort().join(',');
    ok('2 · dos subidas que chocan en el mismo documento: la segunda se reintenta y no se pierde ninguna', r2.includes('a2') && r2.includes('b2'), r2);

    // ---------- 3: A sin conexión (añade, edita, borra) mientras B cambia otras cosas ----------
    await A.setOffline(true);
    await edit(A.page, (S, a) => { S.mov.push(a); S.mov.find((m) => m.id === 'x').i = 15; S.mov = S.mov.filter((m) => m.id !== 'y'); }, mv('a3', 13, 'A3 sin conexión'));
    await wait(1500);
    await edit(B.page, (S, a) => { S.mov.push(a); S.mov.find((m) => m.id === 'x').c = 'Carrera aeropuerto'; }, mv('b3', 33, 'B3'));
    await wait(2000);
    const offMsg = await A.page.evaluate(() => document.querySelector('#sync').textContent);
    ok('3 · sin conexión: A lo dice y guarda todo en el móvil', /Sin conexión/.test(offMsg) && (await local(A.page)).mov.some((m) => m.id === 'a3'), offMsg);
    await A.setOffline(false);
    await wait(3000);
    await sync(B.page);
    const r3 = remoteMov(store);
    const x3 = r3.find((m) => m.id === 'x');
    ok('3 · al volver: lo nuevo de A y de B está en la nube', r3.some((m) => m.id === 'a3') && r3.some((m) => m.id === 'b3'));
    ok('3 · el mismo registro con campos distintos: importe de A y concepto de B, juntos', x3 && x3.i === 15 && x3.c === 'Carrera aeropuerto', JSON.stringify(x3));
    ok('3 · lo borrado sin conexión en A queda borrado (y no vuelve)', !r3.some((m) => m.id === 'y') && !(await local(B.page)).mov.some((m) => m.id === 'y'));
    ok('3 · los dos móviles terminan iguales', fmt((await local(A.page)).mov) === fmt((await local(B.page)).mov));

    // ---------- 4: el MISMO campo cambiado en los dos: se queda uno y el otro se ve en Cuenta ----------
    await A.setOffline(true);
    await edit(A.page, (S, a) => { S.mov.find((m) => m.id === 'z').i = 31; });
    await wait(1200);
    await edit(B.page, (S, a) => { S.mov.find((m) => m.id === 'z').i = 39; });
    await wait(2000);
    await A.setOffline(false);
    await wait(3000);
    await sync(B.page);
    const zA = (await local(A.page)).mov.find((m) => m.id === 'z').i;
    const zB = (await local(B.page)).mov.find((m) => m.id === 'z').i;
    const conf = await A.page.evaluate(async () => (await import('/js/cloud.js')).syncConflicts());
    ok('4 · conflicto en el mismo campo: los dos móviles acaban con el mismo valor', zA === zB, zA + ' / ' + zB);
    ok('4 · el otro valor NO se pierde en silencio: queda apuntado', conf.some((c) => c.id === 'z' && c.field === 'i' && [31, 39].includes(c.local) && [31, 39].includes(c.remote)), JSON.stringify(conf.slice(0, 1)));
    await A.page.evaluate(() => document.querySelector('#acctbtn').click());
    await wait(500);
    const card = await A.page.innerText('#acct');
    ok('4 · y se ve en Cuenta → Sincronización', /Sincronización/i.test(card) && /importe/.test(card), card.split('\n').slice(-4).join(' | '));
    await A.page.click('#syncok');
    await wait(400);
    ok('4 · «Entendido, borrar estos avisos» los quita de la pantalla', !/Sincronización/i.test(await A.page.innerText('#acct')));

    // ---------- 5: una versión ANTIGUA de la app sobrescribe sin un registro (sin lápida) ----------
    const before = remoteMov(store);
    store.db.set('users/u1/data/mov-2026-11', { j: JSON.stringify(before.filter((m) => m.id !== 'a1')) });
    store.db.set('users/u1/data/meta', { ts: Date.now() + 5000 });
    await sync(A.page);
    ok('5 · lo que falta en la nube sin lápida (versión antigua) NO se borra: se recupera', remoteMov(store).some((m) => m.id === 'a1') && (await local(A.page)).mov.some((m) => m.id === 'a1'));

    // ---------- 6: borrar en un móvil y que desaparezca en el otro ----------
    await edit(B.page, (S, a) => { S.mov = S.mov.filter((m) => m.id !== 'b1'); });
    await wait(2500);
    await sync(A.page);
    ok('6 · lo borrado en B desaparece también en A', !(await local(A.page)).mov.some((m) => m.id === 'b1') && !remoteMov(store).some((m) => m.id === 'b1'));

    // ---------- 7: rendimiento: si nada cambió, solo se lee la marca de versión ----------
    await sync(A.page); await sync(B.page); await wait(1500);
    store.state.ops = {}; A.log.length = 0; B.log.length = 0;
    await sync(A.page); await sync(A.page); await sync(B.page);
    console.log('   operaciones A:', A.log.join(', '), '| B:', B.log.join(', '));
    ok('7 · sin cambios: ninguna descarga completa (solo 1 lectura de la marca por sincronización)', !store.state.ops.list && (store.state.ops.get || 0) <= 3, JSON.stringify(store.state.ops));

    // ---------- 7b: borrar en un móvil que está al día (la nube no ha cambiado) ----------
    // Fallo de la versión anterior: se borraba de la nube sin lápida y el otro móvil lo recuperaba.
    const victim = (await local(A.page)).mov[0].id;
    await edit(A.page, (S, id) => { S.mov = S.mov.filter((m) => m.id !== id); }, victim);
    await wait(2500);
    const tomb = JSON.parse(store.docsOf('u1').cfg.j).del;
    ok('7b · borrado en un móvil al día: se deja lápida en la nube', !!(tomb && tomb.mov && tomb.mov[victim]), victim);
    await sync(B.page); await wait(1500); await sync(A.page);
    ok('7b · y el otro móvil también lo borra (no lo recupera)', !(await local(B.page)).mov.some((m) => m.id === victim) && !remoteMov(store).some((m) => m.id === victim) && !(await local(A.page)).mov.some((m) => m.id === victim));

    // ---------- 8: compatibilidad con el formato de la versión anterior de la app ----------
    const docs = store.docsOf('u1');
    ok('8 · los documentos siguen el mismo formato y nombres (los lee la versión anterior)', Object.keys(docs).every((k) => /^(meta|cfg|(mov|srv|gas|huc|jor|prv|fac)-[0-9a-z-]{3,7})$/.test(k)) && Array.isArray(JSON.parse(docs['mov-2026-11'].j)) && typeof docs.meta.ts === 'number');
    ok('9 · sin errores en ninguno de los dos móviles', !A.page.errors.length && !B.page.errors.length, [...A.page.errors, ...B.page.errors].join(' | '));
    await A.ctx.close(); await B.ctx.close();

    // ---------- 10: primer arranque tras ACTUALIZAR la app (sin base, nube en formato antiguo) ----------
    const store2 = createFirestore();
    // Nube escrita por la versión anterior: campos en otro orden, sin lápidas
    store2.db.set('users/u1/data/mov-2026-11', { j: JSON.stringify([{ c: 'Carrera', i: 10, id: 'x', f: '2026-11-20', t: 'in', p: 'efectivo' }, mv('solo-nube', 44, 'Solo en la nube')]) });
    store2.db.set('users/u1/data/cfg', { j: JSON.stringify({ cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } }, cli: {} }) });
    store2.db.set('users/u1/data/meta', { ts: 2000 });
    // Este móvil (con la versión anterior) tenía algo que la nube no, y le falta algo de la nube
    const U = await device(browser, app, store2, { local: base([mv('x', 10), mv('solo-movil', 55, 'Solo en el móvil')]) });
    await wait(3500);
    const lu = (await local(U.page)).mov.map((m) => m.id).sort().join(',');
    const ru = remoteMov(store2).map((m) => m.id).sort().join(',');
    ok('10 · tras actualizar: se une lo del móvil y lo de la nube, sin borrar nada', lu === 'solo-movil,solo-nube,x' && ru === lu, 'móvil ' + lu + ' · nube ' + ru);
    ok('10 · sin avisos de conflicto falsos', (await U.page.evaluate(async () => (await import('/js/cloud.js')).syncConflicts())).length === 0);
    ok('10 · sin errores', !U.page.errors.length, U.page.errors.join(' | '));
    await U.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
