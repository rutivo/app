// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Manos libres: al decir «Oye Rutivo», Rutivo contesta por voz «Dime, ¿en qué puedo ayudarte?»,
// te escucha, apunta, te lo confirma en voz alta y vuelve a esperar. Sin abrir
// ninguna pantalla (para usarlo conduciendo); solo un globo pequeño informativo.
import { ask, normalize, stripFillers, trimChatter } from '../asistente.js';
import { resumeWake, wakeMatch } from '../despertar.js';
import { readFlag } from '../dom.js';
import { createMic } from '../microfono.js';
import { transcribe } from '../oido.js';
import { S, save } from '../store.js';
import { uid } from '../utils.js';

const VOICE_KEY = 'asisVoz';
let rerender = () => {};
let openFull = () => {};
let busy = false;
let cancelled = false;
let mic = null;
let bubble = null;
let hideTimer = null;
const heardLog = []; // lo que ha oído (para comprobar que funciona)
export const handsFreeLog = () => heardLog.slice();
let last = null; // último apunte hecho a manos libres (para «borra lo último» o el botón)

// ---------- voz ----------

let unlocked = false;
/** En iPhone la voz solo funciona si antes hubo un toque: el primer toque en la app la desbloquea. */
function unlockVoice() {
  if (unlocked || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* sin voz */
  }
}

function pickVoice() {
  const all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const es = all.filter((v) => /^es/i.test(v.lang));
  return es.find((v) => /es[-_]ES/i.test(v.lang) && /(Mónica|Monica|Marisol|Google|premium|enhanced|mejorad)/i.test(v.name)) ||
    es.find((v) => /es[-_]ES/i.test(v.lang)) || es[0] || null;
}

/** Dice el texto y espera a que termine (nunca se queda colgado). */
function say(text) {
  return new Promise((resolve) => {
    if (!text || readFlag(VOICE_KEY) === '0' || !window.speechSynthesis) return resolve();
    let done = false;
    let guard;
    const finish = () => { if (done) return; done = true; clearTimeout(guard); setTimeout(resolve, 250); }; // pausa: que el micro no se oiga a sí mismo
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.03;
      u.onend = finish;
      u.onerror = finish;
      guard = setTimeout(() => { if (!speechSynthesis.speaking) finish(); }, 1500);
      u.onstart = () => { clearTimeout(guard); guard = setTimeout(finish, Math.min(20000, 2500 + text.length * 90)); };
      speechSynthesis.speak(u);
    } catch {
      finish();
    }
  });
}

// ---------- globo ----------

const plain = (t) => String(t || '').replace(/\*\*/g, '');

function show(text, state = '', withUndo = false) {
  clearTimeout(hideTimer);
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'hf';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubble.addEventListener('click', (e) => {
      if (e.target.closest('[data-hfundo]')) { undoLast(); return; }
      if (e.target.closest('[data-hfx]')) { cancelHandsFree(); hide(0); }
    });
    document.body.appendChild(bubble);
  }
  bubble.dataset.state = state;
  bubble.replaceChildren();
  const p = document.createElement('div');
  p.className = 'hf-text';
  p.textContent = plain(text);
  bubble.append(p);
  if (withUndo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.hfundo = '';
    b.className = 'hf-undo';
    b.textContent = '↩️ Deshacer';
    bubble.append(b);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.dataset.hfx = '';
  x.className = 'hf-x';
  x.setAttribute('aria-label', 'Cerrar');
  x.textContent = '✕';
  bubble.append(x);
  bubble.hidden = false;
}

function hide(ms = 5000) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (bubble && !busy) bubble.hidden = true; }, ms);
}

// ---------- apuntes ----------

function apply(action) {
  const item = { id: uid(), ...action.item };
  S[action.list].push(item);
  save();
  rerender();
  last = { list: action.list, id: item.id };
}

function undoLast() {
  if (!last) return false;
  const before = S[last.list].length;
  S[last.list] = S[last.list].filter((x) => x.id !== last.id);
  const ok = S[last.list].length < before;
  last = null;
  if (ok) { save(); rerender(); show('↩️ Quitado', 'done'); hide(2500); }
  return ok;
}

// ---------- conversación ----------

async function hear() {
  mic = mic || createMic();
  const audio = await mic.listen((rms) => { if (bubble) bubble.style.setProperty('--lvl', Math.min(1, rms * 9).toFixed(2)); });
  if (bubble) bubble.style.setProperty('--lvl', '0');
  if (!audio || cancelled) return '';
  show('… Entendiendo', 'thinking');
  const text = String((await transcribe(audio)) || '').trim();
  if (heardLog.length > 20) heardLog.shift();
  heardLog.push({ secs: audio.length / 16000, text });
  return text;
}

/**
 * Conversación a manos libres. `first`: lo que dijiste detrás de «Oye Rutivo»
 * («Oye Rutivo, apúntame 15 €…» ya trae la orden).
 */
export async function handsFree(first = '') {
  if (busy) return;
  busy = true;
  cancelled = false;
  let ctx = {};
  let text = String(first || '').trim();
  let misses = 0;
  let handed = false; // pasa a la pantalla del asistente (que gestiona el micro)
  try {
    if (!text) {
      show('👂 Dime, ¿en qué puedo ayudarte?', 'speaking');
      await say('Dime, ¿en qué puedo ayudarte?');
    }
    for (let turn = 0; turn < 5 && !cancelled; turn++) {
      if (!text) {
        show('🗣️ Te escucho…', 'listening');
        let heard = '';
        try {
          heard = await hear();
        } catch {
          show('🎙️ El micro no responde. Toca el icono para hablar.', 'error');
          break;
        }
        if (cancelled) break;
        if (!heard) {
          if (misses++ < 1) { show('🤔 No te he oído', 'speaking'); await say('No te he oído. ¿En qué puedo ayudarte?'); continue; }
          show('👋 Cuando quieras, di «Oye Rutivo»', 'done');
          await say('Vale. Cuando quieras, dime Oye Rutivo.');
          break;
        }
        // Si vuelves a llamarle («Oye Rutivo» otra vez), contesta y sigue escuchando
        const again = wakeMatch(heard);
        if (again && !again.rest) { show('👂 Dime', 'speaking'); await say('Dime.'); continue; }
        if (again) heard = again.rest;
        // Ruido o una palabra suelta sin sentido: como si no te hubiera oído
        if (!stripFillers(normalize(heard))) {
          if (misses++ < 1) { show('🤔 No te he oído', 'speaking'); await say('No te he oído. ¿En qué puedo ayudarte?'); continue; }
          break;
        }
        text = heard;
      }
      const clean = trimChatter(text);
      show('🗣️ «' + clean + '»', 'thinking');
      const r = ask(clean, S, new Date(), { confidence: clean !== text ? 0.4 : 0 }, ctx);
      ctx = r.ctx || {};
      text = '';
      if (r.kind === 'action') {
        apply(r.action);
        show(r.text, 'done', true);
        await say(r.speech);
        break;
      }
      if (r.kind === 'confirm') {
        show(r.text + ' (di «sí» o «no»)', 'speaking');
        await say(r.speech);
        continue;
      }
      if (r.kind === 'undo') {
        const ok = undoLast();
        show(ok ? '↩️ Hecho, lo he quitado' : 'No hay nada que deshacer', 'done');
        await say(ok ? 'Hecho, lo he quitado.' : 'No hay nada que deshacer.');
        break;
      }
      if (r.kind === 'answer') {
        const understood = !/No te he entendido/.test(r.text);
        show(understood ? r.text : '🤔 No te he entendido: «' + clean + '»', understood ? 'done' : 'speaking');
        await say(understood ? r.speech || plain(r.text) : 'No te he entendido. Repítemelo.');
        if (r.ctx && r.ctx.pending) continue; // «¿De cuánto?»
        if (!understood && misses++ < 1) continue; // otra oportunidad
        break;
      }
      // El tiempo, «¿me compensa?», «¿a qué hora salgo?»: en la pantalla del asistente
      hide(0);
      handed = true;
      busy = false;
      openFull(clean);
      return;
    }
  } finally {
    if (mic) { mic.close(); mic = null; }
    busy = false;
    hide(last ? 7000 : 4000);
    if (!cancelled && !handed) resumeWake();
  }
}

/** Para la conversación (al tocar el icono o cerrar el globo). */
export function cancelHandsFree() {
  if (!busy) return false;
  cancelled = true;
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (mic) { mic.cancel(); mic.close(); mic = null; }
  return true;
}

export const handsFreeBusy = () => busy;

export function initHandsFree(rerenderAll, openAssistant) {
  rerender = rerenderAll;
  openFull = openAssistant;
  document.addEventListener('pointerdown', unlockVoice, { passive: true });
}
