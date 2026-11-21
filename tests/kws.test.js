import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { calibrate, detect, detectIn, templateOf, templateSamples } from '../js/kws.js';

// Grabaciones de prueba (voz sintética, 16 kHz): «el conductor» entrena con ent1-3
const DIR = new URL('./fixtures/voz/', import.meta.url);
function wav(name) {
  const b = readFileSync(new URL(name + '.wav', DIR));
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const sz = b.readUInt32LE(o + 4);
    if (id === 'data') {
      const x = new Float32Array(sz / 2);
      for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
      return x;
    }
    o += 8 + sz;
  }
  throw new Error('wav sin datos');
}
const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
const coche = wav('coche');
/** Voz con ruido de coche (relación señal/ruido en dB) y 0,4 s de ruido antes y después. */
function enCoche(v, snr) {
  const pad = 6400;
  const out = new Float32Array(v.length + 2 * pad);
  const k = snr == null ? 0 : rms(v) / (rms(coche) * 10 ** (snr / 20));
  for (let i = 0; i < out.length; i++) out[i] = coche[i % coche.length] * k + (i >= pad && i < pad + v.length ? v[i - pad] : 0);
  return out;
}

const t = ['ent1', 'ent2', 'ent3'].map((f) => templateOf(wav(f)));
const model = { t, thr: calibrate(t) };

test('entrenar: 3 grabaciones dan un umbral razonable', () => {
  assert.ok(model.thr >= 0.5 && model.thr <= 1.0, String(model.thr));
  assert.ok(t.every((x) => x.length > 40 && x.length < 200), t.map((x) => x.length).join(','));
});

test('reconoce «Oye Rutivo» de su voz, en silencio y con ruido de coche', () => {
  for (const f of ['pos1', 'pos5']) {
    for (const snr of [null, 15, 8]) {
      const r = detect(model, enCoche(wav(f), snr));
      assert.ok(r.match, f + ' snr=' + snr + ' d=' + r.d.toFixed(2) + ' umbral=' + model.thr.toFixed(2));
    }
  }
});

test('dicho de un tirón («Oye Rutivo, apúntame…»): queda cerca del umbral (si no salta, lo coge el reconocedor completo)', () => {
  const r = detect(model, enCoche(wav('posfrase1'), null));
  assert.ok(r.d < model.thr * 1.1, 'd=' + r.d.toFixed(2) + ' umbral=' + model.thr.toFixed(2));
});

test('no salta con otras frases ni con el ruido del coche', () => {
  for (const f of ['neg1', 'neg2', 'neg3', 'neg9', 'neg10']) {
    for (const snr of [null, 12]) {
      const r = detect(model, enCoche(wav(f), snr));
      assert.ok(!r.match, f + ' snr=' + snr + ' d=' + r.d.toFixed(2));
    }
  }
  assert.ok(!detect(model, coche).match, 'solo ruido');
});

test('escucha continua: lo encuentra en mitad de una ventana con ruido y sabe dónde acaba', () => {
  const v = wav('pos1');
  const pre = 16000; // 1 s de ruido antes
  const w = new Float32Array(pre + v.length + 4000);
  const k = rms(v) / (rms(coche) * 10 ** (12 / 20));
  for (let i = 0; i < w.length; i++) w[i] = coche[i % coche.length] * k + (i >= pre && i < pre + v.length ? v[i - pre] : 0);
  const len = templateSamples(model);
  const r = detectIn(model, w, Math.round((w.length - len * 0.6) / 160));
  assert.ok(r.match, 'd=' + r.d.toFixed(2));
  assert.ok(Math.abs(r.endSample - (pre + v.length)) < 0.35 * 16000, 'acaba en ' + r.endSample + ', debería ~' + (pre + v.length));
});

test('rápido: menos de 0,15 s por comprobación (antes, el reconocedor completo tardaba 3-4 s)', () => {
  const w = enCoche(wav('posfrase1'), 12);
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) detectIn(model, w.subarray(0, 2.6 * 16000), 100);
  const ms = (performance.now() - t0) / 5;
  assert.ok(ms < 150, ms.toFixed(1) + ' ms');
});
