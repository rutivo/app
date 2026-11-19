// Asistente de voz de Rutivo, al estilo Siri: pantalla completa, bola que escucha,
// lo que dices en grande y la respuesta hablada. Todo se calcula en el móvil.
import { ask } from '../asistente.js';
import { readFlag, writeFlag } from '../dom.js';
import { cachedStatus, etaLine } from '../flight.js';
import { S, save } from '../store.js';
import { esc, uid } from '../utils.js';

const VOICE_KEY = 'asisVoz';
const SUGGEST = ['¿Cuánto llevo hoy?', '¿Qué tengo mañana?', '¿Quién me debe?', 'Apunta 50 € en efectivo', '¿Cuánto gané este mes?', '¿Qué puedo decirte?'];
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const history = []; // {from:'yo'|'rutivo', html, undo?}
const done = []; // posiciones en history de lo apuntado, para «deshaz lo último»
let ctx = {};
let rerenderAll = () => {};
let ui = null;

const voiceOn = () => readFlag(VOICE_KEY) !== '0';

// ---------- voz que habla ----------

let unlocked = false;
/** iOS solo deja hablar si la voz se arranca dentro de un toque: se "despierta" al tocar. */
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

function speak(text) {
  if (!voiceOn() || !window.speechSynthesis || !text) return setState('idle');
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    u.onend = () => setState('idle');
    u.onerror = () => setState('idle');
    setState('speaking');
    speechSynthesis.speak(u);
  } catch {
    setState('idle');
  }
}

// ---------- pantalla ----------

const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function eta(s) {
  const line = etaLine(cachedStatus(s.vu, s.f));
  return line ? '(' + line.replace(/^\S+\s/, '') + ')' : '';
}

const LABELS = { idle: 'Toca la bola y habla', listening: 'Te escucho…', thinking: 'Pensando…', speaking: 'Hablando… (toca la bola para hablar tú)' };

function setState(state, label) {
  if (!ui) return;
  ui.root.dataset.state = state;
  ui.status.textContent = label || LABELS[state] || '';
}

function paint() {
  if (!ui) return;
  ui.chat.innerHTML = history.length
    ? history.map((m, i) => '<div class="siri-msg ' + m.from + '">' + m.html + (m.undo ? '<button type="button" class="small-btn sec" data-asundo="' + i + '">↩️ Deshacer</button>' : '') + '</div>').join('')
    : '<div class="siri-hello">¿En qué te ayudo?</div>';
  ui.chat.scrollTop = ui.chat.scrollHeight;
}

function undoAt(i) {
  const m = history[i];
  if (!m || !m.undo) return false;
  S[m.undo.list] = S[m.undo.list].filter((x) => x.id !== m.undo.id);
  save();
  rerenderAll();
  m.html += '<br><i>Deshecho ✓</i>';
  delete m.undo;
  const k = done.indexOf(i);
  if (k >= 0) done.splice(k, 1);
  return true;
}

function handle(text) {
  const q = String(text || '').trim();
  if (!q) return;
  history.push({ from: 'yo', html: esc(q) });
  setState('thinking');
  const r = ask(q, S, new Date(), { eta }, ctx);
  ctx = r.ctx || {};
  let speech;
  if (r.kind === 'undo') {
    const i = done.length ? done[done.length - 1] : -1;
    const ok = i >= 0 && undoAt(i);
    history.push({ from: 'rutivo', html: ok ? '↩️ Hecho, he quitado lo último que apunté.' : 'No hay nada que deshacer.' });
    speech = ok ? 'Hecho, lo he quitado.' : 'No hay nada que deshacer.';
  } else {
    const entry = { from: 'rutivo', html: rich(r.text) };
    if (r.kind === 'action') {
      const item = { id: uid(), ...r.action.item };
      S[r.action.list].push(item);
      save();
      rerenderAll();
      entry.undo = { list: r.action.list, id: item.id };
      done.push(history.length);
    }
    history.push(entry);
    speech = r.speech;
  }
  paint();
  speak(speech);
}

// ---------- oído ----------

let rec = null;

function stopListening() {
  if (rec) try { rec.abort(); } catch { /* */ }
  rec = null;
}

function micHelp(error) {
  if (!Recognition) return isIOS
    ? 'Aquí el iPhone no deja usar el micrófono directamente. Toca ⌨️ y luego el micrófono 🎤 del teclado para dictar.'
    : 'Este navegador no reconoce la voz. Toca ⌨️ y escribe, o usa el micrófono del teclado.';
  if (error === 'not-allowed') return 'No tengo permiso para el micrófono. Ve a Ajustes → Safari → Micrófono → Permitir, y vuelve a tocar la bola.';
  if (error === 'service-not-allowed') return isIOS ? 'Activa el dictado: Ajustes → General → Teclado → Activar dictado. Mientras, toca ⌨️ y usa el micrófono 🎤 del teclado.' : 'El reconocimiento de voz no está disponible. Toca ⌨️ para escribir.';
  if (error === 'no-speech') return 'No te he oído. Toca la bola y habla cerca del móvil.';
  if (error === 'audio-capture') return 'No encuentro el micrófono. ¿Lo está usando otra app (una llamada)?';
  if (error === 'network') return 'Para entender la voz hace falta internet. Toca ⌨️ para escribir.';
  return 'No he podido escucharte. Toca la bola para intentarlo otra vez, o ⌨️ para escribir.';
}

function showKeyboard(hint) {
  ui.form.hidden = false;
  setState('idle', hint || LABELS.idle);
  setTimeout(() => ui.input.focus(), 30);
}

/** Empieza a escuchar. Se llama SIEMPRE desde un toque (lo exige el iPhone). */
function listen() {
  unlockVoice();
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (!Recognition) return showKeyboard(micHelp());
  if (rec) { stopListening(); setState('idle'); return; }
  let final = '';
  let heard = false;
  let failed = '';
  const r = new Recognition();
  rec = r;
  r.lang = 'es-ES';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onstart = () => setState('listening');
  r.onresult = (e) => {
    heard = true;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (ui) ui.live.textContent = final || interim;
  };
  r.onerror = (e) => { failed = e.error || 'error'; };
  r.onend = () => {
    if (rec === r) rec = null;
    if (!ui) return;
    const text = (final || ui.live.textContent || '').trim();
    ui.live.textContent = '';
    if (text) return handle(text);
    if (failed === 'aborted') return setState('idle');
    if (failed && failed !== 'no-speech') return showKeyboard(micHelp(failed));
    setState('idle', heard ? LABELS.idle : micHelp('no-speech'));
  };
  setState('listening');
  try {
    r.start();
  } catch {
    rec = null;
    showKeyboard(micHelp('error'));
  }
  // Por si el sistema no cierra solo
  setTimeout(() => { if (rec === r) try { r.stop(); } catch { /* */ } }, 12000);
}

// ---------- abrir / cerrar ----------

export function openAssistant() {
  unlockVoice();
  if (ui) return listen();
  const root = document.createElement('div');
  root.className = 'siri';
  root.setAttribute('role', 'dialog');
  root.innerHTML =
    '<div class="siri-top"><button type="button" class="siri-x" data-sx aria-label="Cerrar">✕</button>' +
    '<b>Rutivo</b><button type="button" class="siri-voz" data-svoz></button></div>' +
    '<div class="siri-chat"></div>' +
    '<div class="siri-live" aria-live="polite"></div>' +
    '<div class="siri-sug">' + SUGGEST.map((q) => '<button type="button" data-asq="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
    '<form class="siri-form" hidden><input autocomplete="off" enterkeyhint="send" placeholder="Escribe o dicta con el 🎤 del teclado"><button aria-label="Enviar">➤</button></form>' +
    '<div class="siri-status"></div>' +
    '<div class="siri-bottom"><button type="button" class="siri-kb" data-skb aria-label="Escribir">⌨️</button>' +
    '<button type="button" class="siri-orb" data-sorb aria-label="Hablar"><i></i><i></i><i></i></button>' +
    '<span class="siri-kb"></span></div>';
  document.body.appendChild(root);
  ui = { root, chat: root.querySelector('.siri-chat'), live: root.querySelector('.siri-live'), status: root.querySelector('.siri-status'),
    form: root.querySelector('.siri-form'), input: root.querySelector('.siri-form input'), voz: root.querySelector('[data-svoz]') };
  const paintVoz = () => { ui.voz.textContent = voiceOn() ? '🔊' : '🔇'; ui.voz.title = voiceOn() ? 'Voz activada' : 'Sin voz'; };
  paintVoz();
  root.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.matches('[data-sx]')) return closeAssistant();
    if (el.matches('[data-svoz]')) { writeFlag(VOICE_KEY, voiceOn() ? '0' : '1'); paintVoz(); try { speechSynthesis.cancel(); } catch { /* */ } return setState('idle'); }
    if (el.matches('[data-sorb]')) return listen(); // si está hablando, se calla y te escucha (como Siri)
    if (el.matches('[data-skb]')) { if (ui.form.hidden) showKeyboard(); else ui.form.hidden = true; return; }
    if (el.matches('[data-asq]')) { unlockVoice(); return handle(el.dataset.asq); }
    if (el.matches('[data-asundo]')) { undoAt(+el.dataset.asundo); paint(); }
  });
  ui.form.onsubmit = (e) => {
    e.preventDefault();
    unlockVoice();
    const v = ui.input.value;
    ui.input.value = '';
    handle(v);
  };
  paint();
  setState('idle');
  listen(); // al abrir ya escucha (el toque en el botón cuenta como permiso)
}

export function closeAssistant() {
  stopListening();
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (ui) ui.root.remove();
  ui = null;
}

export function initAssistant(rerender) {
  rerenderAll = rerender;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'asisbtn';
  b.className = 'asis-fab';
  b.setAttribute('aria-label', 'Hablar con Rutivo');
  b.innerHTML = '<i></i>';
  b.onclick = openAssistant;
  document.body.appendChild(b);
  if (window.speechSynthesis) try { speechSynthesis.getVoices(); } catch { /* */ }
}
