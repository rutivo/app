// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// «Oye Rutivo»: con la app abierta en pantalla, el micro escucha y, al oír
// «Oye Rutivo», abre el asistente (y si dices la orden seguida, la hace).
// Todo se procesa dentro del móvil (Whisper); no se envía audio a nadie.
// Para no gastar batería solo se analizan frases cortas (no la radio de fondo).
import { readFlag, writeFlag } from './dom.js';
import { createMic } from './microfono.js';
import { earSupported, prepareEar, transcribe } from './oido.js';

const KEY = 'oyeRutivo';
const MIN_S = 0.5; // frases más cortas: golpes, toses…
const MAX_S = 10; // frases más largas: conversación o radio, no es «Oye Rutivo…»

export const wakeEnabled = () => readFlag(KEY) !== '0';
export function setWakeEnabled(on) {
  writeFlag(KEY, on ? '1' : '0');
  if (on) startWake();
  else stopWake();
}

const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const NAME = /^(rutivo|rutibo|rutiva|rutivos|rutino|rotivo|routivo|ruptivo|rutigo|rutivio|rutifo|rutivu|ruto|rutio|ruti)$/;
const CALL = /^(o+y+e+s?|oie|olle|oy|hoy|hey|ey|eh|ei|o|el|e|y|a|ah)$/; // «Hoy el Rutivo…» (lo que a veces oye Whisper)

/**
 * ¿Es una llamada a Rutivo? Devuelve {rest} con lo que se dijo después
 * («Oye Rutivo, apúntame 20 €» → «apúntame 20 €»), o null.
 */
export function wakeMatch(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    let w = norm(words[i]);
    let used = 1;
    if (!NAME.test(w) && i + 1 < words.length && NAME.test(w + norm(words[i + 1]))) { w += norm(words[i + 1]); used = 2; } // «Ruti vo»
    if (!NAME.test(w)) continue;
    // «Rutivo» solo vale al principio o detrás de «oye/hey…»
    const before = words.slice(0, i).map(norm).filter(Boolean);
    if (before.length > 2 || !before.every((b) => CALL.test(b))) continue;
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
    mic = mic || createMic({ maxMs: MAX_S * 1000 + 1000 }); // lo que llega al tope es radio o charla: se descarta
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
        mic = createMic({ maxMs: MAX_S * 1000 + 1000 });
        continue;
      }
      if (paused || !audio) continue;
      const secs = audio.length / 16000;
      if (heard.length > 20) heard.shift();
      if (secs < MIN_S || secs > MAX_S) { heard.push({ secs, text: null }); continue; }
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
