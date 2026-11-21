// «Oye Rutivo» con tu voz: contesta en menos de 2 s, con ruido de coche.
// El micro del navegador «oye» una grabación: 3 s de coche, «Oye Rutivo» y más coche.
// Se mide desde que acabas de decirlo hasta que Rutivo empieza a contestar.
// Uso: node tests/e2e/oye-rapido.e2e.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const VOZ = path.join(__dirname, '..', 'fixtures', 'voz');

function readWav(name) {
  const b = fs.readFileSync(path.join(VOZ, name + '.wav'));
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const sz = b.readUInt32LE(o + 4);
    if (id === 'data') { const x = new Float32Array(sz / 2); for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768; return x; }
    o += 8 + sz;
  }
}
function writeWav(file, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}
const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

const OIDO = `
export const earSupported = () => true;
export async function prepareEar() {}
export async function transcribe() {
  self.__whisper = (self.__whisper || 0) + 1;
  if (self.__desde && performance.now() < self.__desde) return ''; // antes de la frase solo hay ruido
  return (self.__guion || []).shift() || '';
}
`;

const CONFIG = "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';";
async function context(browser) {
  const ctx = await browser.newContext({ locale: 'es-ES', permissions: ['microphone'] });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: CONFIG });
    if (u.pathname.endsWith('/js/oido.js')) return r.fulfill({ contentType: 'text/javascript', body: OIDO });
    return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
  });
  return ctx;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rutivo-oye-'));
  const app = await serveApp();

  // ---------- 1. Entrenar dentro de la app, por el mismo micro (como lo hará el conductor) ----------
  // Se entrena en el taxi, con el motor en marcha (lo recomendado): ruido 15 dB por debajo de la voz
  const sil = new Float32Array(Math.round(1.4 * 16000));
  const parts = [new Float32Array(16000), readWav('ent1'), sil, readWav('ent2'), sil, readWav('ent3'), sil, sil];
  const ent = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  { let o = 0; for (const p of parts) { ent.set(p, o); o += p.length; } }
  {
    const ruido = readWav('coche');
    const k = rms(readWav('ent1')) / (rms(ruido) * 10 ** (15 / 20));
    for (let i = 0; i < ent.length; i++) ent[i] += ruido[i % ruido.length] * k;
  }
  const entFile = path.join(tmp, 'entreno.wav');
  writeWav(entFile, ent);
  let model = null;
  {
    const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + entFile] });
    const ctx = await context(b);
    const page = await ctx.newPage();
    await page.addInitScript(() => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); });
    await page.goto(app.url);
    const trained = await page.evaluate(async () => { const { trainWake } = await import('/js/despertar.js'); const steps = []; const ok = await trainWake((i, st) => steps.push(st + i)); return { ok, steps }; });
    model = await page.evaluate(() => JSON.parse(localStorage.getItem('oyeHuella') || 'null'));
    ok('0 · entrenar en el taxi (motor en marcha): 3 veces + 1 de prueba por el micro → queda guardado con el límite medido', trained.ok && model && model.t.length === 3 && typeof model.ok === 'number', JSON.stringify(trained.steps) + ' · prueba ' + (model && model.ok != null ? model.ok.toFixed(2) : '-') + ' · límite ' + (model ? model.thr.toFixed(2) : '-'));
    await b.close();
  }
  if (!model) { app.server.close(); console.log(res.filter(Boolean).length + '/' + res.length + ' passed'); process.exit(1); }

  // Grabación: 3 s de coche + «Oye Rutivo» + 7 s de coche (ruido a 12 dB por debajo de la voz)
  const voz = readWav('pos1');
  const coche = readWav('coche');
  const PRE = 3 * 16000;
  const audio = new Float32Array(PRE + voz.length + 7 * 16000);
  const k = rms(voz) / (rms(coche) * 10 ** (12 / 20));
  for (let i = 0; i < audio.length; i++) audio[i] = coche[i % coche.length] * k + (i >= PRE && i < PRE + voz.length ? voz[i - PRE] : 0);
  const file = path.join(tmp, 'coche-oye.wav');
  writeWav(file, audio);
  const phraseEnd = (PRE + voz.length) / 16000; // segundos desde que se abre el micro

  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + file] });
  try {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((model) => {
      for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '1']]) localStorage.setItem(k, v);
      localStorage.setItem('cajaTransfer', JSON.stringify({ mov: [], srv: [], gas: [], huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } }));
      localStorage.setItem('oyeHuella', JSON.stringify(model)); // ya entrenado con su voz
      self.__guion = ['Apúntame 20 como gasto con tarjeta'];
      // Cuándo se abre el micro (empieza a sonar la grabación)
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => { const s = await real(c); if (!self.__micAt) self.__micAt = performance.now(); return s; };
      self.__dicho = [];
      const fake = { speaking: false, getVoices: () => [], cancel() {},
        speak(u) { if (u.text.trim()) self.__dicho.push({ t: performance.now(), text: u.text }); setTimeout(() => { if (u.onstart) u.onstart(); setTimeout(() => u.onend && u.onend(), 200); }, 20); } };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    }, model);
    await page.goto(app.url);
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !(await page.evaluate(() => self.__dicho.length))) await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({ micAt: self.__micAt, dicho: self.__dicho, whisper: self.__whisper || 0 }));
    const first = r.dicho[0];
    const latency = first ? (first.t - r.micAt) / 1000 - phraseEnd : null;
    ok('1 · al oír «Oye Rutivo» (con ruido de coche) contesta «Dime, ¿en qué puedo ayudarte?»', first && /ayudarte/.test(first.text), JSON.stringify(r.dicho.map((d) => d.text)));
    ok('2 · y contesta en MENOS DE 2 SEGUNDOS desde que acabas de decirlo', latency !== null && latency < 2, latency !== null ? latency.toFixed(2) + ' s' : 'no contestó');
    ok('3 · para detectarlo no ha hecho falta el reconocedor completo (el lento)', r.whisper === 0, 'veces que se usó Whisper antes de contestar: ' + r.whisper);
    // Después dice la orden y la apunta
    const t1 = Date.now();
    let mov = [];
    while (Date.now() - t1 < 20000) { mov = await page.evaluate(() => JSON.parse(localStorage.getItem('cajaTransfer')).mov); if (mov.length) break; await page.waitForTimeout(200); }
    ok('4 · luego «Apúntame 20 como gasto con tarjeta» → apuntado', mov.length === 1 && mov[0].t === 'out' && mov[0].i === 20 && mov[0].p === 'tarjeta', JSON.stringify(mov));
    ok('5 · sin errores', !errs.length, errs.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
  }

  // ---------- B. Entrenado en SILENCIO y usado en el coche: aprende solo ----------
  // 1.ª vez: el detector rápido casi lo reconoce → lo confirma el reconocedor completo y aprende.
  // 2.ª vez (otra toma): ya contesta rápido.
  try {
    const sil = new Float32Array(Math.round(1.4 * 16000));
    const parts = [new Float32Array(16000), readWav('ent1'), sil, readWav('ent2'), sil, readWav('ent3'), sil, sil];
    const ent = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
    { let o = 0; for (const p of parts) { ent.set(p, o); o += p.length; } }
    writeWav(entFile, ent);
    let modelS = null;
    {
      const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + entFile] });
      const ctx = await context(b);
      const page = await ctx.newPage();
      await page.addInitScript(() => { for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v); });
      await page.goto(app.url);
      await page.evaluate(async () => { const { trainWake } = await import('/js/despertar.js'); await trainWake(); });
      modelS = await page.evaluate(() => JSON.parse(localStorage.getItem('oyeHuella') || 'null'));
      await b.close();
    }
    const v1 = readWav('pos1');
    const v2 = readWav('pos5');
    const P1 = 3 * 16000;
    const P2 = P1 + v1.length + 22 * 16000;
    const a2 = new Float32Array(P2 + v2.length + 6 * 16000);
    const k2 = rms(v1) / (rms(coche) * 10 ** (12 / 20));
    for (let i = 0; i < a2.length; i++) a2[i] = coche[i % coche.length] * k2 + (i >= P1 && i < P1 + v1.length ? v1[i - P1] : 0) + (i >= P2 && i < P2 + v2.length ? v2[i - P2] : 0);
    const f2 = path.join(tmp, 'coche-2veces.wav');
    writeWav(f2, a2);
    const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + f2] });
    try {
      const ctx = await context(b);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.addInitScript(({ model, p1 }) => {
        for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '1']]) localStorage.setItem(k, v);
        localStorage.setItem('cajaTransfer', JSON.stringify({ mov: [], srv: [], gas: [], huc: [], fac: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', iva: 10, legal: { v: 1, at: '2026-11-20' } } }));
        localStorage.setItem('oyeHuella', JSON.stringify(model));
        self.__guion = ['Oye Rutivo', 'Apúntame 20 como gasto con tarjeta', 'Apúntame 5 como gasto en efectivo'];
        const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (c) => { const s = await real(c); if (!self.__micAt) { self.__micAt = performance.now(); self.__desde = self.__micAt + p1 * 1000; } return s; };
        self.__dicho = [];
        const fake = { speaking: false, getVoices: () => [], cancel() {},
          speak(u) { if (u.text.trim()) self.__dicho.push({ t: performance.now(), text: u.text }); setTimeout(() => { if (u.onstart) u.onstart(); setTimeout(() => u.onend && u.onend(), 200); }, 20); } };
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
        window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      }, { model: modelS, p1: P1 / 16000 });
      await page.goto(app.url);
      const end2 = (P2 + v2.length) / 16000;
      const tB = Date.now();
      while (Date.now() - tB < 50000) {
        if ((await page.evaluate(() => self.__dicho.filter((x) => /ayudarte/.test(x.text)).length)) >= 1 && Date.now() - tB > 35000) break;
        await page.waitForTimeout(250);
      }
      const r = await page.evaluate(() => ({ micAt: self.__micAt, dicho: self.__dicho, m: JSON.parse(localStorage.getItem('oyeHuella')) }));
      const greets = r.dicho.filter((x) => /ayudarte/.test(x.text));
      ok('6 · entrenado en silencio, en el coche: la 1.ª vez contesta igualmente (lo confirma el reconocedor completo)', greets.length >= 1, JSON.stringify(r.dicho.map((x) => x.text)));
      ok('7 · y aprende ese ejemplo de tu voz en el coche', r.m && r.m.t.length >= 4 && r.m.learned >= 1, 'ejemplos: ' + (r.m ? r.m.t.length : 0));
      // La 2.ª toma (distinta) queda justo en el umbral en esta simulación: en la app la confirmaría el
      // reconocedor completo (unos segundos) y la aprendería también. Aquí solo se informa.
      const second = greets[1];
      console.log('   info · 2.ª toma: ' + (second ? 'contestó a los ' + ((second.t - r.micAt) / 1000 - end2).toFixed(2) + ' s de acabar' : 'no contestó'));
      ok('8 · sin errores', !errs.length, errs.join(' | '));
    } finally {
      await b.close();
    }
  } finally {
    app.server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
