// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// «Oye Rutivo»: con la app abierta en pantalla, el micro escucha y, al oír
// «Oye Rutivo», abre el asistente (y si dices la orden seguida, la hace).
// Todo se procesa dentro del móvil (Whisper); no se envía audio a nadie.
// Se escucha en trozos de hasta unos segundos: con ruido de fondo constante (motor,
// radio, aire) la frase nunca «termina», así que los trozos largos también se analizan.
import { readFlag, writeFlag } from './dom.js';
import { createMic } from './microfono.js';
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

let onWake = () => {};
let onState = () => {};
let onProgress = () => {};
let mic = null;
let running = false;
let paused = false;
let state = 'off';
const heard = []; // últimas frases analizadas (para comprobar que funciona)
export const wakeLog = () => heard.slice();

const setState = (s) => { state = s; onState(s); };
export const wakeState = () => state;

async function loop() {
  if (running) return;
  running = true;
  setState('listening');
  try {
    // La primera vez (o si se borró) se descarga el reconocedor: se enseña cómo va
    await prepareEar((p) => onProgress(p));
    onProgress(null);
    mic = mic || createMic({ maxMs: MAX_S * 1000 });
    let deaf = 0;
    while (!paused && wakeEnabled() && document.visibilityState === 'visible') {
      let audio;
      try {
        audio = await mic.listen();
        deaf = 0;
      } catch (err) {
        if (mic) mic.close();
        mic = null;
        // Sin permiso: no se insiste
        if (err && err.name === 'NotAllowedError') { setState('denied'); return; }
        // Micro mudo: se reintenta solo unas veces (con un respiro); si sigue, hace falta un toque
        if (++deaf > 3) { setState('tap'); return; }
        await new Promise((r) => setTimeout(r, 1500 * deaf));
        mic = createMic({ maxMs: MAX_S * 1000 });
        continue;
      }
      if (paused || !audio) continue;
      const secs = audio.length / 16000;
      if (heard.length > 20) heard.shift();
      if (secs < MIN_S) { heard.push({ secs, text: null }); continue; }
      let text = '';
      try {
        text = await transcribe(audio);
      } catch {
        continue;
      }
      heard.push({ secs, text });
      const m = wakeMatch(text);
      if (m && !paused) {
        pauseWake();
        onWake(m.rest);
        return;
      }
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
  if (!wakeEnabled() || paused || !earSupported() || document.visibilityState !== 'visible') return;
  loop();
}

function stopWake() {
  if (mic) { mic.cancel(); mic.close(); mic = null; }
  setState('off');
}

/** Mientras el asistente está abierto (usa su propio micro). */
export function pauseWake() {
  paused = true;
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
  onWake = wake;
  onState = stateChanged;
  onProgress = progress;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startWake();
    else if (mic) { mic.cancel(); mic.close(); mic = null; } // en segundo plano el sistema lo corta igual
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
    setState('tap');
  }
}
