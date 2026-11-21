// Fotos de los tickets: todas caben en la nube, las antiguas se suben solas
// y la copia de seguridad en archivo las lleva (y las restaura).
// Uso: node tests/e2e/fotos.e2e.cjs
const { chromium } = require('playwright');
const { createFirestore, serveApp, device } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (gas) => ({ mov: [], srv: [], gas, huc: [], prv: [], jor: [], fac: [], cfg: { legal: { v: 1, at: '2026-11-20' } } });
const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')));
/** Foto «difícil» (mucho detalle, como un ticket con ruido) grande en JPEG. */
const bigPhoto = (page, w = 1600, h = 2000, q = 0.95) => page.evaluate(([w, h, q]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const d = g.createImageData(w, h);
  let x = 12345; for (let i = 0; i < d.data.length; i += 4) { x = (x * 1103515245 + 12345) & 0x7fffffff; const v = x & 255; d.data[i] = v; d.data[i + 1] = (v * 7) & 255; d.data[i + 2] = (v * 13) & 255; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); g.fillStyle = '#000'; g.font = '80px sans-serif'; g.fillText('TOTAL 63,40 EUR', 100, 300);
  return c.toDataURL('image/jpeg', q);
}, [w, h, q]);
const cloudPhoto = (store, id) => { const v = store.db.get('users/u1/fotos/' + id); return v && v.d; };

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const store = createFirestore();
    const legacy = { id: 'g0', mid: 'm0', f: '2026-11-02', i: 50, l: 30, p: 'tarjeta', s: 'Repsol', ph: 1 };
    const A = await device(browser, app, store, { local: state([legacy]), name: 'A' });
    await wait(2500);

    // ---------- 1. Foto antigua grande que solo estaba en el móvil ----------
    const big = await bigPhoto(A.page);
    await A.page.evaluate(async (big) => { const s = await import('/js/store.js'); await s.savePhotoLocal('g0', big); localStorage.removeItem('fotosNube'); }, big);
    ok('0 · la foto de prueba es más grande de lo que cabía antes en la nube', big.length > 240000, Math.round(big.length / 1000) + ' KB');
    await A.page.reload();
    for (let i = 0; i < 40 && !cloudPhoto(store, 'g0'); i++) await wait(250);
    const up0 = cloudPhoto(store, 'g0');
    ok('1 · la foto antigua (solo en el móvil) se sube sola al abrir la app con cuenta', !!up0, up0 ? Math.round(up0.length / 1000) + ' KB' : 'no subida');
    ok('2 · y se ajusta para caber (≤ 230 KB)', up0 && up0.length <= 230000);
    const dims = up0 && await A.page.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = src; }), up0);
    ok('3 · sigue siendo una imagen legible (al menos 400 px)', dims && Math.max(...dims) >= 400, dims && dims.join('×'));
    const same = await A.page.evaluate(async () => (await (await import('/js/store.js')).getPhotoLocal('g0')));
    ok('4 · en el móvil queda la misma foto que en la nube', same === up0);

    // ---------- 2. Foto nueva grande desde la pantalla de gasolina ----------
    const buf = Buffer.from((await bigPhoto(A.page, 1600, 2000, 0.97)).split(',')[1], 'base64');
    await A.page.evaluate(() => document.querySelector('button[data-v="ga"]').click());
    await A.page.fill('#gi', '45');
    await A.page.setInputFiles('#gh', { name: 'ticket.jpg', mimeType: 'image/jpeg', buffer: buf });
    await A.page.evaluate(() => document.querySelector('#fg').requestSubmit());
    let g1 = null;
    for (let i = 0; i < 40 && !g1; i++) { await wait(250); g1 = (await local(A.page)).gas.find((g) => g.id !== 'g0' && g.ph); }
    for (let i = 0; i < 40 && g1 && !cloudPhoto(store, g1.id); i++) await wait(250);
    const up1 = g1 && cloudPhoto(store, g1.id);
    ok('5 · foto nueva grande: se guarda y se sube a la nube (antes: solo en el móvil)', !!up1, buf.length + ' bytes → ' + (up1 ? Math.round(up1.length / 1000) + ' KB' : 'no subida'));

    // ---------- 3. Copia de seguridad en archivo con las fotos ----------
    const file = await A.page.evaluate(async () => (await import('/js/store.js')).exportBackupFull());
    const data = JSON.parse(file);
    ok('6 · la copia en archivo lleva las fotos de los tickets', data.fotos && data.fotos.g0 && g1 && data.fotos[g1.id], Object.keys(data.fotos || {}).join(','));
    const text = await A.page.evaluate(async () => (await import('/js/store.js')).exportBackup());
    ok('7 · «copiar como texto» sigue sin fotos (texto corto)', !JSON.parse(text).fotos);

    // Móvil nuevo SIN cuenta: restaura la copia del archivo
    const B = await device(browser, app, store, { uid: 'u2', local: null, owner: false, name: 'B' });
    await wait(1500);
    const restored = await B.page.evaluate(async (file) => {
      const s = await import('/js/store.js');
      await s.importBackup(file);
      const ids = s.S.gas.filter((g) => g.ph).map((g) => g.id);
      const got = [];
      for (const id of ids) if (await s.getPhotoLocal(id)) got.push(id);
      return { ids, got };
    }, file);
    ok('8 · al restaurar en otro móvil, vuelven los tickets con su foto', restored.ids.length === 2 && restored.got.length === 2, JSON.stringify(restored));
    const evil = await B.page.evaluate(async (file) => {
      const s = await import('/js/store.js');
      const d = JSON.parse(file);
      d.fotos = { g0: 'javascript:alert(1)', otro: d.fotos.g0 };
      d.gas = d.gas.map((g) => ({ ...g }));
      await s.removePhotoLocal('g0');
      await s.importBackup(JSON.stringify(d));
      return { g0: !!(await s.getPhotoLocal('g0')), otro: !!(await s.getPhotoLocal('otro')) };
    }, file);
    ok('9 · una copia con «fotos» falsas o ajenas no mete nada raro', !evil.g0 && !evil.otro, JSON.stringify(evil));
    ok('10 · sin errores', !A.page.errors.length && !B.page.errors.length, [...A.page.errors, ...B.page.errors].join(' | '));
    await A.ctx.close(); await B.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
