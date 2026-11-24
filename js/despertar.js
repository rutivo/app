// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// «Oye Rutivo»: con la app abierta en pantalla, el micro escucha y, al oír
// «Oye Rutivo», abre el asistente (y si dices la orden seguida, la hace).
// Todo se procesa dentro del móvil (Whisper); no se envía audio a nadie.
// Se escucha en trozos de hasta unos segundos: con ruido de fondo constante (motor,
// radio, aire) la frase nunca «termina», así que los trozos largos también se analizan.
import { readFlag, writeFlag } from './dom.js';
import { createMic, resample } from './microfono.js';
import { calibrate, detectIn, dtwPrefix, templateOf, templateSamples, trimSilence } from './kws.js';
import { earSupported, prepareEar, transcribe } from './oido.js';

const KEY = 'oyeRutivo';
const MIN_S = 0.5; // frases más cortas: golpes, toses…
const MAX_S = 6; // trozo máximo que se escucha antes de analizarlo (con ruido de fondo se llega siempre)

export const wakeEnabled = () => readFlag(KEY) !== '0';
export function setWakeEnabled(on) {
  writeFlag(KEY, on ? '1' : '0');
  if (on) startWake();
  else stopWake();
}

const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// Formas en que el reconocedor suele oír «Rutivo» (además, vale cualquier palabra muy parecida: ver isName)
const NAME = /^(rutivo|rutibo|rutiva|rutivos|rutino|rotivo|routivo|ruptivo|rutigo|rutivio|rutifo|rutivu|ruto|rutio|ruti|rutiv|rutiba|rotibo|rudivo|ruvivo|rutivio|brutivo|grutivo|rutibos|rutiboo|rutibu|reutivo|ritivo|rativo|rutibio)$/;
// Palabras normales parecidas a «Rutivo» que NO lo son
const NOT_NAME = new Set(['ruido', 'ruidos', 'ruta', 'rutas', 'rutina', 'rutinas', 'rico', 'rica', 'rio', 'rojo', 'roja', 'rubia', 'ritmo', 'rito', 'rotativo', 'motivo', 'motivos', 'activo', 'nativo', 'festivo', 'cultivo', 'relativo', 'positivo', 'olivo', 'rutilo']);
/** Distancia de edición (cuántas letras cambian), corta: solo para palabras cortas */
function dist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** ¿Es «Rutivo» (o como lo suele oír el reconocedor)? */
function isName(w) {
  if (!w || NOT_NAME.has(w)) return false;
  if (NAME.test(w)) return true;
  // Muy parecida a «rutivo»: empieza por r (o br/gr/tr, que a veces se cuela) y cambia como mucho 2 letras
  return w.length >= 5 && w.length <= 8 && /^(r|br|gr|tr)[aeiou]/.test(w) && dist(w.replace(/^[bgt](?=r)/, ''), 'rutivo') <= 2;
}
// Lo que se dice antes de «Rutivo» para llamarlo (y lo que a veces oye el reconocedor: «Hoy el Rutivo…»)
const STRONG = /^(o+y+e+|oie|olle|hey|hola|oiga|oyeme|escucha|escuchame)$/;
const CALL = /^(o+y+e+s?|oie|olle|oy|hoy|hey|ey|eh|ei|o|el|e|y|a|ah|hola|ola|oiga|oigan|oyeme|escucha|escuchame|venga|vamos|vale|buenas|buenos|dias|tu|che|mira|bueno|pues)$/;

/**
 * ¿Es una llamada a Rutivo? Devuelve {rest} con lo que se dijo después
 * («Oye Rutivo, apúntame 20 €» → «apúntame 20 €»), o null.
 */
export function wakeMatch(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let w = norm(words[i]);
    let used = 1;
    // Todo junto: «Oyerutivo», «Heyrutivo»
    const glued = w.match(/^(oye|oie|olle|hey|ey|hola|ola)(r.+)$/);
    if (glued && isName(glued[2])) w = glued[2];
    else if (!isName(w) && i + 1 < words.length && isName(w + norm(words[i + 1]))) { w += norm(words[i + 1]); used = 2; } // «Ruti vo»
    if (!isName(w)) continue;
    // «Rutivo» vale al principio (con «oye/hey/hola…» delante), o en mitad de lo que se oye
    // si justo antes hay una llamada clara («…con la radio puesta, oye Rutivo»). En mitad de una
    // conversación sin llamada («el rutivo de mi primo») no.
    const before = words.slice(0, i).map(norm).filter(Boolean);
    const atStart = before.length <= 3 && before.every((b) => CALL.test(b));
    const called = before.length && STRONG.test(before[before.length - 1]);
    if (!atStart && !called) continue;
    const rest = words.slice(i + used).join(' ').replace(/^[\s,.:;!¡?¿-]+/, '').trim();
    return { rest };
  }
  return null;
}

// ---------- «Oye Rutivo» con tu voz (respuesta en ~1 s; ver kws.js) ----------
const MODEL_KEY = 'oyeHuella';
/** Huellas de tu «Oye Rutivo» (o null si aún no lo has entrenado). */
export function wakeModel() {
  try {
    const m = JSON.parse(localStorage.getItem(MODEL_KEY) || 'null');
    return m && Array.isArray(m.t) && m.t.length && typeof m.thr === 'number' ? m : null;
  } catch {
    return null;
  }
}
export function forgetWakeModel() {
  try { localStorage.removeItem(MODEL_KEY); } catch { /* nada */ }
}
/**
 * Entrena con tu voz: graba `n` veces «Oye Rutivo». `step(i, estado)` cuenta cómo va
 * ('escucha' | 'ok' | 'otra'). Devuelve true si quedó guardado.
 */
export async function trainWake(step = () => {}, n = 3) {
  pauseWake();
  const m = createMic({ maxMs: 4500, silenceMs: 600 });
  const t = [];
  try {
    for (let tries = 0; t.length < n && tries < n + 6; tries++) {
      step(t.length, 'escucha');
      const audio = await m.listen();
      // Con el motor en marcha la grabación no «termina» sola: se recorta alrededor de tu voz.
      // «Oye Rutivo» dura algo menos de 2 s: si sale más largo o más corto, la toma está mal cortada.
      const voice = audio ? trimSilence(audio) : null;
      const secs = voice ? voice.length / 16000 : 0;
      if (!voice || secs < 0.4 || secs > 2.8) { step(t.length, 'otra'); continue; }
      const tpl = templateOf(voice);
      if (tpl.length < 25) { step(t.length, 'otra'); continue; }
      t.push(tpl);
      // Una toma que no se parece a las demás (cortada, con un golpe…) estropearía el detector: se repite
      if (t.length === n) {
        const mean = t.map((a, i) => t.filter((_, j) => j !== i).reduce((acc, b) => acc + dtwPrefix(a, b).d, 0) / (n - 1));
        const worst = mean.indexOf(Math.max(...mean));
        if (mean[worst] > 0.85) { t.splice(worst, 1); step(t.length, 'otra'); continue; }
      }
      step(t.length, 'ok');
    }
  } finally {
    m.close();
  }
  if (t.length < n) { m.close(); return false; }
  // Prueba: una vez más, para medir cuánto se parece DE VERDAD tu voz en este móvil (micro, coche…)
  // y poner el límite con eso (las voces reales varían más que las de prueba).
  let ok = null;
  const m2 = createMic({ maxMs: 4500, silenceMs: 600 });
  try {
    for (let tries = 0; ok === null && tries < 3; tries++) {
      step(n, 'prueba');
      const audio = await m2.listen();
      const voice = audio ? trimSilence(audio) : null;
      if (!voice || voice.length < 0.4 * 16000 || voice.length > 2.8 * 16000) { step(n, 'otra'); continue; }
      const r = detectIn({ t, thr: 9 }, voice, 20);
      if (r.d > 1.15) { step(n, 'otra'); continue; } // no era «Oye Rutivo» (o mucho ruido)
      ok = r.d;
    }
  } finally {
    m2.close();
  }
  const thr = Math.min(0.95, Math.max(calibrate(t), ok === null ? 0 : ok * 1.12));
  try { localStorage.setItem(MODEL_KEY, JSON.stringify({ t, thr, ok, at: Date.now() })); } catch { return false; }
  step(n + 1, 'ok');
  return true;
}

// ---------- lo que ve el detector (para ajustarse solo y para enseñarlo) ----------
let lastSeen = { d: Infinity, at: 0 };
let lastWakeFast = false; // el último «Oye Rutivo» lo detectó el detector rápido
const THR_MAX = 0.95;

/** Cambia el límite guardado (se ajusta solo con lo que pasa de verdad). */
function setThr(fn) {
  const m = wakeModel();
  if (!m) return;
  const floor = m.ok ? Math.min(0.9, m.ok * 1.02) : 0.6; // nunca más estricto que tu toma de prueba
  const thr = Math.min(THR_MAX, Math.max(floor, fn(m.thr)));
  try { localStorage.setItem(MODEL_KEY, JSON.stringify({ ...m, thr })); } catch { /* nada */ }
}

/**
 * Tras contestar «Dime…», no dijiste nada que se entendiera: probablemente fue una
 * falsa alarma del detector rápido → se vuelve un poco más estricto.
 */
export function wakeNoCommand() {
  if (!lastWakeFast) return;
  lastWakeFast = false;
  setThr((t) => t - 0.02);
}

/** Para enseñar en el asistente: parecido más alto oído hace poco y el límite. */
export function wakeStats() {
  const m = wakeModel();
  if (!m) return null;
  return { thr: m.thr, ok: m.ok, last: Date.now() - lastSeen.at < 15000 ? lastSeen.d : null };
}

const NEAR = 0.15; // «casi»: hasta 0,15 por encima del umbral, lo confirma el reconocedor completo
const MAX_LEARNED = 4; // ejemplos aprendidos solos (además de los 3 del entreno)

/** Aprende de un «Oye Rutivo» que el detector rápido casi no reconoció (confirmado por el reconocedor completo). */
function learn(phrase) {
  const m = wakeModel();
  if (!m || !phrase) return false;
  const tpl = templateOf(phrase);
  if (tpl.length < 25) return false;
  const base = m.t.slice(0, 3);
  const learned = m.t.slice(3).concat([tpl]).slice(-MAX_LEARNED);
  try { localStorage.setItem(MODEL_KEY, JSON.stringify({ ...m, t: base.concat(learned), learned: (m.learned || 0) + 1 })); } catch { return false; }
  return true;
}

const STEP_CHUNKS = 3; // mira cada ~0,25 s
const WINDOW_S = 2.6; // los últimos 2,6 s
const AFTER_S = 0.45; // tras «Oye Rutivo», si callas 0,45 s contesta; si sigues hablando, espera a la orden

/**
 * Mientras se graba: ¿acabas de decir «Oye Rutivo»? Si después callas, se para
 * enseguida (contesta en ~1 s aunque haya ruido de fondo). Si sigues hablando
 * («Oye Rutivo, apúntame 20…»), se deja grabar la orden entera.
 */
function streamWatcher(model, found) {
  let calls = 0;
  const len = templateSamples(model);
  return (chunks, rate) => {
    if (++calls % STEP_CHUNKS) return false;
    let total = 0;
    for (const c of chunks) total += c.length;
    const need = Math.round(WINDOW_S * rate);
    const raw = new Float32Array(Math.min(total, need));
    for (let i = chunks.length - 1, o = raw.length; i >= 0 && o > 0; i--) {
      const c = chunks[i];
      const take = Math.min(c.length, o);
      raw.set(c.subarray(c.length - take), o - take);
      o -= take;
    }
    const win = resample(raw, rate);
    const total16 = Math.round((total * 16000) / rate);
    if (!found.hit) {
      if (win.length < len * 0.6) return false;
      const thr = model.thr;
      const r = detectIn(model, win, Math.max(0, Math.round((win.length - len * 0.6) / 160)));
      if (!lastSeen.at || r.d < lastSeen.d || Date.now() - lastSeen.at > 4000) lastSeen = { d: r.d, at: Date.now() };
      if (!r.match) {
        // Casi: se guarda el trozo por si el reconocedor completo confirma que era «Oye Rutivo» (y se aprende)
        if (r.d <= thr + NEAR && (!found.near || r.d < found.near.d)) {
          found.near = { d: r.d, phrase: win.slice(Math.max(0, r.endSample - Math.round(len * 1.3)), r.endSample) };
        }
        return false;
      }
      let e = 0;
      for (let i = Math.max(0, r.endSample - len); i < r.endSample; i++) e += win[i] * win[i];
      found.hit = { end: total16 - (win.length - r.endSample), rms: Math.sqrt(e / Math.max(1, len)), d: r.d };
      return false;
    }
    const after = total16 - found.hit.end;
    if (after < AFTER_S * 16000) return false;
    // ¿Sigues hablando? (la voz suena bastante más que el ruido de fondo)
    const tail = win.subarray(Math.max(0, win.length - Math.round(AFTER_S * 16000)));
    let e = 0;
    for (const v of tail) e += v * v;
    const level = Math.sqrt(e / Math.max(1, tail.length));
    if (level < found.hit.rms * 0.35) { found.only = true; return true; } // solo «Oye Rutivo»: contesta ya
    return false; // sigue hablando: que acabe la frase (la orden)
  };
}

let onWake = () => {};
let onState = () => {};
let onProgress = () => {};
let mic = null;
let running = false;
let paused = false;
let ready = false; // solo escucha si el asistente se ha preparado (initWake); escondido = nunca pide el micro
let state = 'off';
const heard = []; // últimas frases analizadas (para comprobar que funciona)
export const wakeLog = () => heard.slice();

const setState = (s) => { state = s; onState(s); };
export const wakeState = () => state;

const WAKE_TOKENS = 24; // palabras como mucho al analizar (basta para «Oye Rutivo, apúntame 20 como gasto con tarjeta»)
const WAKE_SILENCE_MS = 700; // 0,7 s callado = has terminado (contesta antes)

/**
 * Analiza lo grabado SIN dejar de escuchar: mientras el reconocedor piensa una
 * frase, el micro ya está grabando la siguiente (antes se quedaba sordo esos
 * segundos y «Oye Rutivo» se perdía, sobre todo con ruido de fondo).
 * Si se acumulan frases, se analizan las más recientes.
 */
let queue = [];
let analyzing = false;
let woke = false;
async function analyze() {
  if (analyzing) return;
  analyzing = true;
  try {
    while (queue.length && !paused && !woke) {
      const { audio, near } = queue.shift();
      const secs = audio.length / 16000;
      let text = '';
      try {
        text = await transcribe(audio, 45000, { maxTokens: WAKE_TOKENS, model: 'base' }); // vigilar: el ligero
      } catch {
        continue;
      }
      if (heard.length > 20) heard.shift();
      heard.push({ secs, text });
      const m = wakeMatch(text);
      if (m && !paused && !woke) {
        // El detector rápido casi lo tenía: aprende este ejemplo (tu voz, tu coche) para la próxima
        if (near && learn(near.phrase)) {
          heard[heard.length - 1].learned = true;
          setThr((t) => Math.max(t, near.d * 1.03)); // tu voz real se parece «así»: el límite llega hasta ahí
        }
        lastWakeFast = false;
        woke = true;
        queue = [];
        pauseWake(); // para el micro de la escucha de fondo (el asistente usa el suyo)
        onWake(m.rest);
        return;
      }
    }
  } finally {
    analyzing = false;
  }
}

async function loop() {
  if (running) return;
  running = true;
  woke = false;
  setState('listening');
  try {
    // La primera vez (o si se borró) se descarga el reconocedor: se enseña cómo va.
    // Para vigilar «Oye Rutivo», el ligero; después, por detrás, el grande para entender las órdenes.
    await prepareEar((p) => onProgress(p), 'base');
    onProgress(null);
    prepareEar((p) => onProgress(p), 'small').then(() => onProgress(null), () => onProgress(null));
    const newMic = () => createMic({ maxMs: MAX_S * 1000, silenceMs: WAKE_SILENCE_MS });
    mic = mic || newMic();
    let deaf = 0;
    while (!paused && !woke && wakeEnabled() && document.visibilityState === 'visible') {
      let audio;
      const model = wakeModel();
      const found = {};
      try {
        audio = await mic.listen(() => {}, model ? streamWatcher(model, found) : null);
        deaf = 0;
      } catch (err) {
        if (mic) mic.close();
        mic = null;
        // Sin permiso: no se insiste
        if (err && err.name === 'NotAllowedError') { setState('denied'); return; }
        // Micro mudo: se reintenta solo unas veces (con un respiro); si sigue, hace falta un toque
        if (++deaf > 3) { setState('tap'); return; }
        await new Promise((r) => setTimeout(r, 1500 * deaf));
        mic = newMic();
        continue;
      }
      if (paused || woke || !audio) continue;
      // Detectado con tu voz: contesta ya. Si dijiste la orden seguida, se entiende lo de después.
      if (found.hit && !woke) {
        woke = true;
        lastWakeFast = true;
        queue = [];
        if (heard.length > 20) heard.shift();
        heard.push({ secs: audio.length / 16000, text: '«Oye Rutivo» (tu voz)' + (found.only ? '' : ' + orden') });
        const rest = found.only ? null : audio.subarray(Math.min(audio.length, found.hit.end));
        pauseWake();
        if (!rest || rest.length < 0.6 * 16000) { onWake(''); return; }
        let text = '';
        try { text = await transcribe(rest); } catch { text = ''; }
        onWake(String(text || '').trim());
        return;
      }
      const secs = audio.length / 16000;
      if (secs < MIN_S) {
        if (heard.length > 20) heard.shift();
        heard.push({ secs, text: null });
        continue;
      }
      // A la cola y a seguir escuchando enseguida (sin esperar a entenderlo)
      queue.push({ audio, near: found.near || null });
      if (queue.length > 2) queue.shift(); // si se acumulan, mandan las más recientes
      analyze();
    }
  } catch {
    onProgress(null);
    setState('tap');
    return;
  } finally {
    running = false;
  }
  if (state === 'listening') setState(paused ? 'paused' : 'off');
}

/** Empieza a escuchar «Oye Rutivo» (si está activado y la app se ve). */
export function startWake() {
  if (!ready || !wakeEnabled() || paused || !earSupported() || document.visibilityState !== 'visible') return;
  loop();
}

function stopWake() {
  if (mic) { mic.cancel(); mic.close(); mic = null; }
  setState('off');
}

/** Mientras el asistente está abierto (usa su propio micro). */
export function pauseWake() {
  paused = true;
  queue = [];
  if (mic) { mic.cancel(); mic.close(); mic = null; }
  setState('paused');
}
export function resumeWake() {
  paused = false;
  setTimeout(startWake, 600);
}

/**
 * Prepara «Oye Rutivo». `wake(rest)` abre el asistente; `stateChanged(estado)`
 * pinta el icono: 'listening' | 'tap' | 'denied' | 'paused' | 'off'.
 * `progress({loaded, total} | null)`: descarga del reconocedor (null = terminada).
 */
export async function initWake(wake, stateChanged = () => {}, progress = () => {}) {
  ready = true;
  onWake = wake;
  onState = stateChanged;
  onProgress = progress;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Al volver de segundo plano, primero dejamos que termine la escucha
      // anterior: iOS a veces tarda en liberar el micrófono.
      setTimeout(startWake, 700);
    } else if (mic) {
      mic.cancel(); mic.close(); mic = null; // iOS corta la captura al suspender la PWA
    }
  });
  // Safari puede restaurar la PWA desde memoria (bfcache) sin un cambio de
  // visibilidad fiable. pageshow cubre ese regreso y evita quedarse desconectado.
  window.addEventListener('pageshow', () => {
    if (document.visibilityState === 'visible') setTimeout(startWake, 700);
  });
  // Cualquier toque en la app sirve para (re)activar el micro si hace falta (iPhone lo exige)
  document.addEventListener('pointerdown', () => { if (state === 'tap' || state === 'off') startWake(); }, { passive: true });
  if (!wakeEnabled() || !earSupported()) return setState('off');
  // Al abrir la app solo arranca solo si el permiso del micro ya está dado (sin preguntas por sorpresa)
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    if (p.state === 'granted') startWake();
    else setState('tap');
  } catch {
    // En Safari/iOS Permissions API puede no existir o rechazar la consulta.
    // Si Rutivo ya obtuvo el permiso anteriormente, intentamos reutilizarlo;
    // getUserMedia seguirá respetando cualquier revocación hecha en Ajustes.
    let grantedBefore = false;
    try { grantedBefore = localStorage.getItem('rutivoMicGranted') === '1'; } catch { /* nada */ }
    if (grantedBefore) startWake();
    else setState('tap');
  }
}
