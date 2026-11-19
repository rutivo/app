// Asistente de voz de Rutivo: botón de micrófono en todas las pantallas.
// Escucha (reconocimiento de voz del propio móvil), responde con tus datos y lo dice en voz alta.
import { ask } from '../asistente.js';
import { bottomSheet, readFlag, writeFlag } from '../dom.js';
import { cachedStatus, etaLine } from '../flight.js';
import { S, save } from '../store.js';
import { esc, uid } from '../utils.js';

const VOICE_KEY = 'asisVoz';
const SUGGEST = ['¿Cuánto llevo hoy?', '¿Qué tengo mañana?', '¿Quién me debe?', '¿Cuánto gané este mes?', 'Apunta 45 € en efectivo', '¿Qué puedo preguntar?'];
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const history = []; // conversación de esta sesión: {from:'yo'|'rutivo', html}
let rerenderAll = () => {};

const voiceOn = () => readFlag(VOICE_KEY) !== '0';

function speak(text) {
  if (!voiceOn() || !window.speechSynthesis || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    const v = speechSynthesis.getVoices().find((x) => /^es(-|_)ES/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^es/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}

/** **negrita** y saltos de línea, con el resto escapado. */
const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function eta(s) {
  const line = etaLine(cachedStatus(s.vu, s.f));
  return line ? '(' + line.replace(/^\S+\s/, '') + ')' : '';
}

export function openAssistant() {
  const sheet = bottomSheet(
    '<div class="asis-hd"><h3>🎙️ Rutivo</h3><button type="button" class="asis-voz" id="asvoz"></button></div>' +
    '<div class="asis-chat" id="aschat"></div>' +
    '<div class="hchips asis-sug" id="assug">' + SUGGEST.map((q) => '<button type="button" class="hchip" data-asq="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
    '<form class="asis-in" id="asform"><input id="astx" autocomplete="off" placeholder="Pregunta o pide algo…" enterkeyhint="send">' +
    '<button type="button" class="asis-mic" id="asmic" aria-label="Hablar">🎙️</button><button class="asis-go" aria-label="Enviar">➤</button></form>' +
    '<div class="mut asis-tip" id="astip"></div>',
    { onClose: () => { stop(); try { speechSynthesis.cancel(); } catch { /* */ } } },
  );
  const chat = sheet.querySelector('#aschat');
  const input = sheet.querySelector('#astx');
  const mic = sheet.querySelector('#asmic');
  const tip = sheet.querySelector('#astip');
  const vozBtn = sheet.querySelector('#asvoz');
  const paintVoz = () => { vozBtn.textContent = voiceOn() ? '🔊 Voz' : '🔇 Sin voz'; };
  paintVoz();
  vozBtn.onclick = () => { writeFlag(VOICE_KEY, voiceOn() ? '0' : '1'); paintVoz(); if (!voiceOn()) try { speechSynthesis.cancel(); } catch { /* */ } };

  const paint = () => {
    chat.innerHTML = history.length
      ? history.map((m, i) => '<div class="asis-msg ' + m.from + '">' + m.html + (m.undo ? '<button type="button" class="small-btn sec" data-asundo="' + i + '">↩️ Deshacer</button>' : '') + '</div>').join('')
      : '<div class="asis-msg rutivo">¡Hola! Pregúntame lo que quieras de tu trabajo o pídeme que apunte algo. 🚕</div>';
    chat.scrollTop = chat.scrollHeight;
  };

  const handle = (text) => {
    const q = text.trim();
    if (!q) return;
    history.push({ from: 'yo', html: esc(q) });
    const r = ask(q, S, new Date(), { eta });
    const msg = { from: 'rutivo', html: rich(r.text) };
    if (r.kind === 'action') {
      const item = { id: uid(), ...r.action.item };
      S[r.action.list].push(item);
      save();
      rerenderAll();
      msg.undo = { list: r.action.list, id: item.id };
    }
    history.push(msg);
    paint();
    speak(r.speech);
  };

  chat.addEventListener('click', (e) => {
    const b = e.target.closest('[data-asundo]');
    if (!b) return;
    const m = history[+b.dataset.asundo];
    if (!m || !m.undo) return;
    S[m.undo.list] = S[m.undo.list].filter((x) => x.id !== m.undo.id);
    save();
    rerenderAll();
    m.html += '<br><i>Deshecho.</i>';
    delete m.undo;
    paint();
  });
  sheet.querySelector('#assug').addEventListener('click', (e) => {
    const b = e.target.closest('[data-asq]');
    if (b) handle(b.dataset.asq);
  });
  sheet.querySelector('#asform').onsubmit = (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    handle(v);
  };

  // --- escuchar ---
  let rec = null;
  function stop() {
    if (rec) try { rec.abort(); } catch { /* */ }
    rec = null;
    mic.classList.remove('on');
  }
  function listen() {
    if (!Recognition) {
      input.focus();
      tip.textContent = 'Toca el micrófono 🎤 del teclado para dictar la pregunta.';
      return;
    }
    if (rec) return stop();
    try { speechSynthesis.cancel(); } catch { /* */ }
    rec = new Recognition();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let final = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      input.value = final || interim;
    };
    rec.onerror = (e) => {
      tip.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Permite el micrófono para Rutivo, o toca el micrófono 🎤 del teclado para dictar.'
        : e.error === 'no-speech' ? 'No te he oído. Toca 🎙️ y habla.' : '';
    };
    rec.onend = () => {
      mic.classList.remove('on');
      if (tip.textContent === 'Te escucho…') tip.textContent = '';
      rec = null;
      const text = (final || input.value).trim();
      if (text) { input.value = ''; handle(text); }
    };
    mic.classList.add('on');
    tip.textContent = 'Te escucho…';
    try { rec.start(); } catch { stop(); }
  }
  mic.onclick = listen;
  paint();
  listen(); // al abrir, ya escucha
  return sheet;
}

export function initAssistant(rerender) {
  rerenderAll = rerender;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'asisbtn';
  b.className = 'asis-fab';
  b.setAttribute('aria-label', 'Pregúntale a Rutivo');
  b.textContent = '🎙️';
  b.onclick = openAssistant;
  document.body.appendChild(b);
}

