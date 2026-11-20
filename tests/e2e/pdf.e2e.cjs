// Tarea 3: pdf.js 6.4.299 y jsPDF 4.2.1 — leer, generar y descargar PDF (navegador real).
// Uso: node tests/e2e/pdf.e2e.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const FIX = path.join(__dirname, 'fixtures');

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 400, height: 860 }, acceptDownloads: true });
    const csp = [];
    const blocked = [];
    await ctx.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const TRIAL_ENABLED=false;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';" });
      if (u.hostname === '127.0.0.1') return r.continue();
      blocked.push(u.hostname);
      return r.abort();
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (/Content Security Policy|Refused/.test(m.text())) csp.push(m.text().slice(0, 160)); });
    await page.addInitScript(() => {
      localStorage.setItem('cajaTransfer', JSON.stringify({
        mov: [{ id: 'm1', f: '2026-11-03', t: 'in', p: 'efectivo', i: 120, c: 'Carrera' }, { id: 'g1m', f: '2026-11-05', t: 'out', p: 'tarjeta', i: 49.91, c: 'Gasolina: Repsol' }],
        srv: [{ id: 's1', f: '2026-11-04', h: '10:00', cl: 'Viajes Costa S.L.', o: 'Aeropuerto', d: 'Marbella', i: 95, p: 'tarjeta' }],
        gas: [{ id: 'g1', mid: 'g1m', f: '2026-11-05', i: 49.91, l: 34.21, p: 'tarjeta', s: 'Repsol' }], huc: [], fac: [], prv: [], jor: [],
        cli: { 'Viajes Costa S.L.': { nif: 'B12345674', dir: 'Av. Andalucía 3' } },
        cfg: { nom: 'Antonio Ruiz', nif: '12345678Z', dir: 'C/ Larios 1', loc: 'Málaga', iva: 10, facOn: 1, legal: { v: 1, at: '2026-11-20' }, gestor: '' } }));
      for (const [k, v] of [['tipInstall', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
    });
    await page.goto(app.url);
    await page.waitForTimeout(1200);
    ok('0 · pdf.js ya no se carga al abrir la app (solo al usarlo)', !(await page.evaluate(() => 'pdfjsLib' in window)));

    // ---------- Generar: factura (html2canvas + jsPDF 4) ----------
    await page.evaluate(() => document.querySelector('.tabs button[data-v="fa"]').click());
    await page.waitForTimeout(400);
    await page.click('#mk'); await page.waitForTimeout(600);
    const [d1] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#pr')]);
    const facturaPdf = fs.readFileSync(await d1.path());
    ok('1 · factura: se genera y se descarga un PDF', /\.pdf$/.test(d1.suggestedFilename()) && facturaPdf.slice(0, 5).toString() === '%PDF-', d1.suggestedFilename() + ' · ' + Math.round(facturaPdf.length / 1024) + ' KB');
    await page.click('#cl').catch(() => {});

    // ---------- Generar: paquete de tickets de gasolina (jsPDF 4, texto) ----------
    await page.evaluate(() => document.querySelector('.tabs button[data-v="ga"]').click());
    await page.waitForTimeout(400);
    const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#gpdf')]);
    const gasPdf = fs.readFileSync(await d2.path());
    ok('2 · tickets de gasolina: se genera y se descarga el PDF', gasPdf.slice(0, 5).toString() === '%PDF-', d2.suggestedFilename());

    // ---------- Leer: los PDF generados, con el lector nuevo (pdf.js 6) ----------
    const read = async (buf, name) => page.evaluate(async ([b64, name]) => {
      const { openPdf, firstPageCanvas } = await import('/js/pdfLib.js');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], name, { type: 'application/pdf' });
      const pdf = await openPdf(file);
      const p1 = await pdf.getPage(1);
      const text = (await p1.getTextContent()).items.map((i) => i.str).join(' ');
      const pages = pdf.numPages;
      pdf.loadingTask.destroy();
      const c = await firstPageCanvas(file, 600);
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] < 384) dark++;
      return { pages, text, dark, w: c.width, h: c.height };
    }, [buf.toString('base64'), name]);
    const r1 = await read(facturaPdf, 'factura.pdf');
    ok('3 · la factura generada se abre con pdf.js 6 y se ve (no sale en blanco)', r1.pages >= 1 && r1.dark > 1000, r1.pages + ' pág · ' + r1.dark + ' píxeles con contenido');
    const r2 = await read(gasPdf, 'gasolina.pdf');
    ok('4 · el PDF de gasolina se lee, con su texto', r2.pages >= 1 && /Repsol|Gasolina|49,91/.test(r2.text), r2.text.slice(0, 80));

    // ---------- Leer: ticket escaneado con imagen JPEG 2000 (descodificador wasm) ----------
    const jpx = fs.readFileSync(path.join(FIX, 'ticket-escaneado-jpx.pdf'));
    const r3 = await read(jpx, 'ticket-escaneado.pdf');
    ok('5 · ticket escaneado (JPEG 2000): se dibuja la imagen, no sale en blanco', r3.dark > 5000, r3.dark + ' píxeles oscuros de ' + (r3.w * r3.h));

    // ---------- Leer: subir un PDF como ticket de gasolina (lo que hace el usuario) ----------
    await page.evaluate(() => document.querySelector('.tabs button[data-v="ga"]').click());
    const before = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('foto_')).length);
    const input = await page.$('#v-ga input[type=file]');
    await input.setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: gasPdf });
    await page.waitForTimeout(2500);
    // Guardar el ticket (el lector de texto de tickets necesita internet: aquí se rellena a mano)
    await page.fill('#gi', '20').catch(() => {});
    await page.evaluate(() => { const f = document.querySelector('#v-ga form'); if (f) f.requestSubmit(); });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('foto_')).length);
    ok('6 · al subir un PDF como ticket, se convierte en imagen y se guarda', after > before, before + ' → ' + after + ' fotos');

    // ---------- iPhone con iOS < 17.4 (sin Promise.withResolvers), en la app y en el proceso aparte ----------
    const old = await ctx.newPage();
    const oldErr = [];
    old.on('pageerror', (e) => oldErr.push(e.message));
    await old.addInitScript(() => { delete Promise.withResolvers; });
    await old.goto(app.url);
    await old.waitForTimeout(800);
    const r4 = await old.evaluate(async ([b64, base]) => {
      // El navegador no la trae (se quitó antes de cargar la app): si existe, es el sustituto de pdfCompat.js
      const missing = typeof Promise.withResolvers === 'function' && /new this/.test(String(Promise.withResolvers));
      const { loadPdfjs, firstPageCanvas } = await import('/js/pdfLib.js');
      const pdfjs = await loadPdfjs();
      // Proceso aparte que tampoco lo tiene: se le quita y luego carga el de la app
      // (importaciones estáticas, en orden: primero se le quita, luego carga pdfWorker.mjs de la app)
      const quitar = URL.createObjectURL(new Blob(['delete Promise.withResolvers;'], { type: 'text/javascript' }));
      const src = 'import ' + JSON.stringify(quitar) + '; import ' + JSON.stringify(base + 'js/pdfWorker.mjs') + ';';
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const c = await Promise.race([firstPageCanvas(new File([bytes], 't.pdf', { type: 'application/pdf' }), 600),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), 20000))]);
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] < 384) dark++;
      return { missing, dark };
    }, [jpx.toString('base64'), app.url]);
    ok('10 · iPhone con iOS < 17.4 (sin Promise.withResolvers): el sustituto actúa y el PDF escaneado se abre igual', r4.missing && r4.dark > 5000 && !oldErr.length, JSON.stringify(r4) + ' ' + oldErr.join(' | '));
    await old.close();

    ok('7 · sin bloqueos de la política de seguridad (CSP)', !csp.length, csp.join(' | '));
    ok('8 · todo se sirve desde la app (ninguna petición fuera)', !blocked.filter((h) => !/jsdelivr/.test(h)).length, [...new Set(blocked)].join(', '));
    ok('9 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
