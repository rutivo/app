// Eliminar la cuenta: se borran tus datos de la nube y del móvil y TAMBIÉN los
// enlaces que mandaste a tus clientes (enlaces/{código}); los de otro conductor, no.
// Uso: node tests/e2e/cuenta-borrar.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const MIO = 'AbCdEfGhIjKlMnOpQrSt';
const DE_OTRO = 'ZyXwVuTsRqPoNmLkJiHg';
const NUEVO = 'NuevoNuevoNuevoNuevo'; // formato nuevo: sin uid, con la marca en tu zona (y que este móvil no conoce)
const STATE = {
  mov: [{ id: 'm1', f: '2026-11-20', t: 'in', p: 'efectivo', i: 50, c: 'Carrera' }], gas: [], huc: [], prv: [], jor: [], fac: [], cli: {},
  srv: [{ id: 's1', f: '2026-12-01', h: '10:00', cl: 'Viajes Costa', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'pendiente', pa: 'John Smith', lk: MIO }],
  cfg: { nom: 'Antonio', legal: { v: 1, at: '2026-11-20' } },
};

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    const exp = { __ts: Date.now() + 5 * 864e5 };
    store.db.set('enlaces/' + MIO, { o: 'u1', d: '{"v":1}', exp });
    store.db.set('enlaces/' + DE_OTRO, { o: 'u2', d: '{"v":1}', exp });
    store.db.set('enlaces/' + NUEVO, { d: '{"v":1}', exp });
    store.db.set('users/u1/enlaces/' + NUEVO, {});
    const A = await device(browser, app, store, { local: STATE, name: 'A' });
    const page = A.page;
    await page.waitForTimeout(2500);
    ok('1 · antes: tus datos y tu enlace están en la nube', Object.keys(store.docsOf('u1')).length > 0 && store.db.has('enlaces/' + MIO));
    await page.click('#acctbtn');
    await page.waitForTimeout(400);
    await page.click('#adel summary');
    await page.fill('#adpw', 'secreta123');
    await page.click('#adgo');
    await page.click('#adgo'); // segundo toque: confirmar
    await page.waitForTimeout(2500);
    ok('2 · al eliminar la cuenta se borran tus datos de la nube', Object.keys(store.docsOf('u1')).length === 0, JSON.stringify(Object.keys(store.docsOf('u1'))));
    ok('3 · y también los enlaces que mandaste a tus clientes (el antiguo y el nuevo, aunque este móvil no lo conozca), con sus marcas', !store.db.has('enlaces/' + MIO) && !store.db.has('enlaces/' + NUEVO) && !store.db.has('users/u1/enlaces/' + NUEVO));
    ok('4 · el enlace de otro conductor no se toca', store.db.has('enlaces/' + DE_OTRO));
    ok('5 · y en el móvil no queda nada tuyo', !(await page.evaluate(() => localStorage.getItem('cajaTransfer') || '')).includes('John Smith'));
    ok('6 · sin errores', !page.errors.length, page.errors.join(' | '));
    await A.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
