// Detector rápido de «Oye Rutivo» con TU voz (como el «Oye Siri» de Apple, en pequeño).
//
// El reconocedor de voz completo (Whisper) siempre analiza 30 s de audio y tarda
// varios segundos en el móvil. Para contestar en menos de 2 s, «Oye Rutivo» se
// detecta así: dices la frase 3 veces una sola vez (se guarda su «huella» de
// sonido: coeficientes MFCC) y luego cada frase que se oye se compara con esas
// huellas (DTW, que admite que lo digas más rápido o más lento). Tarda unas
// centésimas de segundo. Todo dentro del móvil; no se envía nada.
// Funciones puras (sin pantalla), para poder probarlas.

const RATE = 16000;
const FRAME = 400; // 25 ms
const HOP = 160; // 10 ms
const NFFT = 512;
const NMEL = 26;
const NCEP = 13;

// ---------- MFCC ----------

const hamming = Float32Array.from({ length: FRAME }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
const melOf = (f) => 2595 * Math.log10(1 + f / 700);
const hzOf = (m) => 700 * (10 ** (m / 2595) - 1);

/** Filtros mel triangulares (de 60 a 7600 Hz). */
const FILTERS = (() => {
  const lo = melOf(60);
  const hi = melOf(7600);
  const pts = Array.from({ length: NMEL + 2 }, (_, i) => Math.floor(((NFFT + 1) * hzOf(lo + ((hi - lo) * i) / (NMEL + 1))) / RATE));
  return Array.from({ length: NMEL }, (_, m) => {
    const w = new Float32Array(NFFT / 2 + 1);
    for (let k = pts[m]; k < pts[m + 1]; k++) w[k] = (k - pts[m]) / Math.max(1, pts[m + 1] - pts[m]);
    for (let k = pts[m + 1]; k < pts[m + 2]; k++) w[k] = (pts[m + 2] - k) / Math.max(1, pts[m + 2] - pts[m + 1]);
    return w;
  });
})();

const DCT = Array.from({ length: NCEP }, (_, i) => Float32Array.from({ length: NMEL }, (_, j) => Math.cos((Math.PI * i * (j + 0.5)) / NMEL)));

/** FFT (radix 2, en el sitio). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Coeficientes MFCC (sin el de energía) por trozos de 10 ms, normalizados (resta media / divide desviación). */
export const mfcc = (samples) => normalize(mfccRaw(samples));

/** MFCC sin normalizar. */
function mfccRaw(samples) {
  const frames = [];
  const melFrames = [];
  const re = new Float32Array(NFFT);
  const im = new Float32Array(NFFT);
  const mel = new Float32Array(NMEL);
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME; i++) re[i] = (samples[start + i] - 0.97 * (samples[start + i - 1] || 0)) * hamming[i];
    fft(re, im);
    for (let m = 0; m < NMEL; m++) {
      let e = 0;
      const w = FILTERS[m];
      for (let k = 0; k <= NFFT / 2; k++) if (w[k]) e += w[k] * (re[k] * re[k] + im[k] * im[k]);
      mel[m] = e;
    }
    melFrames.push(Float64Array.from(mel));
  }
  // Resta el ruido de fondo (motor, aire, radio baja): por cada banda, lo que suena en
  // los momentos más callados. Medido con ruido de coche: menos falsas alarmas y más aciertos.
  for (let m = 0; m < NMEL; m++) {
    const vals = melFrames.map((f) => f[m]).sort((a, b) => a - b);
    const floor = vals[Math.floor(vals.length * 0.1)] || 0;
    for (const f of melFrames) f[m] = Math.max(f[m] - floor, f[m] * 0.05);
  }
  for (const mf of melFrames) {
    const c = new Float32Array(NCEP - 1);
    // c1 (el «tono» general: lo que más cambia con el micro y el retumbar del coche) no se usa
    for (let i = 2; i < NCEP; i++) {
      let s = 0;
      for (let j = 0; j < NMEL; j++) s += DCT[i][j] * Math.log(mf[j] + 1e-10);
      c[i - 1] = s;
    }
    frames.push(c);
  }
  return frames;
}

/**
 * Normalización por frase (copia): quita el «color» del micro y del coche.
 * Se calcula sobre el trozo que se compara, no sobre todo lo grabado: si no,
 * el ruido de antes y después cambiaría la huella.
 */
function normalize(raw) {
  const frames = raw.map((f) => Float32Array.from(f));
  const d = NCEP - 1;
  const mean = new Float32Array(d);
  const sd = new Float32Array(d);
  for (const f of frames) for (let i = 0; i < d; i++) mean[i] += f[i] / frames.length;
  for (const f of frames) for (let i = 0; i < d; i++) sd[i] += (f[i] - mean[i]) ** 2 / frames.length;
  for (let i = 0; i < d; i++) sd[i] = Math.sqrt(sd[i]) || 1;
  for (const f of frames) for (let i = 0; i < d; i++) f[i] = (f[i] - mean[i]) / sd[i];
  return frames;
}

/** Quita el silencio del principio y del final (por energía). */
export function trimSilence(samples) {
  const win = 320; // 20 ms
  const en = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) s += samples[i + j] ** 2;
    en.push(Math.sqrt(s / win));
  }
  if (!en.length) return samples;
  const peak = Math.max(...en);
  const thr = Math.max(0.006, peak * 0.12);
  let a = en.findIndex((e) => e > thr);
  let b = en.length - 1 - [...en].reverse().findIndex((e) => e > thr);
  if (a < 0) return samples.subarray(0, 0);
  a = Math.max(0, a - 2);
  b = Math.min(en.length - 1, b + 2);
  return samples.subarray(a * win, (b + 1) * win);
}

// ---------- comparación (DTW) ----------

const dist = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / a.length);
};

/**
 * Parecido entre la huella `t` y el principio de `x` (la frase puede seguir:
 * «Oye Rutivo, apúntame…»). Devuelve la distancia media del mejor camino
 * (menor = más parecido) y dónde acaba la frase en `x`.
 */
export function dtwPrefix(t, x) {
  const n = t.length;
  const m = Math.min(x.length, Math.round(n * 1.6));
  if (!n || m < n * 0.6) return { d: Infinity, end: 0 };
  const band = Math.max(8, Math.round(n * 0.4));
  let prev = new Float64Array(m + 1).fill(Infinity);
  let cur = new Float64Array(m + 1);
  let prevL = new Int32Array(m + 1);
  let curL = new Int32Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    const center = Math.round((i * m) / n);
    const lo = Math.max(1, Math.min(center, i) - band);
    const hi = Math.min(m, Math.max(center, Math.round(i * 1.6)) + band);
    for (let j = lo; j <= hi; j++) {
      const c = dist(t[i - 1], x[j - 1]);
      let best = prev[j - 1];
      let len = prevL[j - 1];
      if (prev[j] < best) { best = prev[j]; len = prevL[j]; }
      if (cur[j - 1] < best) { best = cur[j - 1]; len = curL[j - 1]; }
      cur[j] = best + c;
      curL[j] = len + 1;
    }
    [prev, cur] = [cur, prev];
    [prevL, curL] = [curL, prevL];
  }
  // Final abierto: la frase puede acabar antes que lo grabado
  let d = Infinity;
  let end = 0;
  for (let j = Math.round(n * 0.6); j <= m; j++) {
    if (!Number.isFinite(prev[j])) continue;
    const v = prev[j] / prevL[j];
    if (v < d) { d = v; end = j; }
  }
  return { d, end };
}

/** Huella de una grabación de «Oye Rutivo» (para guardar). */
export const templateOf = (samples) => mfcc(trimSilence(samples)).map((f) => Array.from(f, (v) => Math.round(v * 1000) / 1000));

/** Umbral a partir de las huellas grabadas: lo que se parecen entre ellas, con margen. */
export function calibrate(templates) {
  const ds = [];
  for (let i = 0; i < templates.length; i++) for (let j = 0; j < templates.length; j++) if (i !== j) ds.push(dtwPrefix(templates[i], templates[j]).d);
  const worst = Math.max(...ds.filter(Number.isFinite));
  // Medido pasando el audio por el micro del navegador (supresión de ruido y ganancia, como en el
  // móvil), entrenando en silencio y entrenando en el coche: un tope fijo de 0,70 detectó todos los
  // «Oye Rutivo» dichos con una pausa y dio 0 falsas alarmas en 41 s de frases con ruido. Calibrar
  // solo con las 3 tomas fallaba si se entrenaba con ruido (tomas muy distintas → umbral muy laxo).
  return Math.min(0.7, Math.max(0.5, worst * 1.15));
}

/**
 * ¿Empieza este audio por «Oye Rutivo»? Compara el principio (hasta 0,4 s de
 * margen) con cada huella. Devuelve {match, d, endSample}.
 */
export function detect(model, samples) {
  return detectIn(model, trimSilence(samples), 40);
}

/**
 * Busca «Oye Rutivo» empezando en cualquier punto de los primeros `maxOff`
 * trozos de 10 ms de `samples` (para la escucha continua: ventana de los
 * últimos segundos). `endSample`: dónde acaba la frase dentro de `samples`.
 */
export function detectIn(model, samples, maxOff = 40) {
  if (!model || !model.t || !model.t.length) return { match: false, d: Infinity, endSample: 0 };
  const raw = mfccRaw(samples);
  let best = { d: Infinity, end: 0 };
  for (const t of model.t) {
    for (let off = 0; off <= maxOff && off < raw.length - t.length * 0.6; off += 4) {
      // Se normaliza solo el trozo candidato (lo que dura tu frase, con un poco de margen)
      const r = dtwPrefix(t, normalize(raw.slice(off, off + Math.round(t.length * 1.3))));
      if (r.d < best.d) best = { d: r.d, end: r.end + off };
    }
  }
  return { match: best.d <= model.thr, d: best.d, endSample: Math.min(samples.length, best.end * HOP + FRAME) };
}

/** Duración media de las huellas, en muestras (lo que dura tu «Oye Rutivo»). */
export const templateSamples = (model) => (model && model.t && model.t.length ? Math.round((model.t.reduce((a, t) => a + t.length, 0) / model.t.length) * HOP) : 0);
