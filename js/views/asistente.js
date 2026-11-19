// Asistente de voz de Rutivo, al estilo Siri: pantalla completa, bola que escucha,
// lo que dices en grande y la respuesta hablada. Todo se calcula en el móvil.
import { ask, weatherText } from '../asistente.js';
import { readFlag, writeFlag } from '../dom.js';
import { cachedStatus, etaLine } from '../flight.js';
import { S, save } from '../store.js';
import { esc, uid } from '../utils.js';
import { driverName } from '../welcome.js';

const VOICE_KEY = 'asisVoz';
const SUGGEST = ['¿Cuánto llevo hoy?', '¿Qué tengo mañana?', '¿Qué tiempo hace?', '¿Quién me debe?', 'Apunta 50 € en efectivo', '¿Cuánto gané este mes?', '¿Qué puedo decirte?'];
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

const LABELS = { idle: 'Toca la bola y habla', listening: 'Te escucho… (con ruido, toca la bola al terminar)', thinking: 'Pensando…', speaking: 'Hablando… (toca la bola para hablar tú)' };

function setState(state, label) {
  if (!ui) return;
  ui.root.dataset.state = state;
  ui.status.textContent = label || LABELS[state] || '';
}

function paint() {
  if (!ui) return;
  ui.chat.innerHTML = history.length
    ? history.map((m, i) => '<div class="siri-msg ' + m.from + '">' + m.html + (m.undo ? '<button type="button" class="small-btn sec" data-asundo="' + i + '">↩️ Deshacer</button>' : '') + '</div>').join('')
    : '<div class="siri-hello">' + (driverName(S.cfg) ? 'Hola, ' + esc(driverName(S.cfg)) + '.<br>' : '') + '¿En qué te ayudo?</div>';
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

/**
 * De varias transcripciones posibles (el móvil a veces duda: «bulla»/«falla»),
 * se queda con la primera que tiene sentido.
 */
function best(options, conf = 0) {
  const list = [...new Set(options.map((o) => String(o || '').trim()).filter(Boolean))];
  // Una orden completa vale más que una a medias, y esta más que algo que no se entiende.
  const score = (r) => (r.kind === 'action' || r.kind === 'confirm' || r.kind === 'undo' || r.kind === 'weather' ? 3 : /No te he entendido/.test(r.text || '') ? 0 : r.pending ? 1 : 2);
  let top = null;
  for (const q of list) {
    const r = ask(q, S, new Date(), { eta, confidence: conf }, ctx);
    if (!top || score(r) > score(top.r)) top = { q, r };
  }
  return top;
}

function handle(text, alternatives = [], conf = 0) {
  // Las preguntas «¿Lo apunto?» anteriores ya no se pueden contestar con botones
  history.forEach((m) => { m.html = m.html.replace(/<div class="siri-yn">[\s\S]*?<\/div>/, ''); });
  const pick = best([text, ...alternatives], conf);
  if (!pick) return;
  const q = pick.q;
  history.push({ from: 'yo', html: esc(q) });
  setState('thinking');
  const r = pick.r;
  ctx = r.ctx || {};
  let speech;
  if (r.kind === 'undo') {
    const i = done.length ? done[done.length - 1] : -1;
    const ok = i >= 0 && undoAt(i);
    history.push({ from: 'rutivo', html: ok ? '↩️ Hecho, he quitado lo último que apunté.' : 'No hay nada que deshacer.' });
    speech = ok ? 'Hecho, lo he quitado.' : 'No hay nada que deshacer.';
  } else if (r.kind === 'confirm') {
    history.push({ from: 'rutivo', html: rich(r.text) + '<div class="siri-yn"><button type="button" data-asyes>✅ Sí, apúntalo</button><button type="button" class="sec" data-asno>❌ No</button></div>' });
    speech = r.speech;
  } else if (r.kind === 'weather') {
    const entry = { from: 'rutivo', html: rich(r.text) };
    history.push(entry);
    paint();
    weather(entry, r);
    return;
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

// ---------- el tiempo ----------

const GEO_KEY = 'meteoGeo';

/** Coordenadas de tu ciudad (la de tus datos de emisor; si no hay, Málaga). Se guardan. */
async function cityCoords() {
  const city = (S.cfg.loc || '').trim() || 'Málaga';
  try {
    const saved = JSON.parse(readFlag(GEO_KEY) || 'null');
    if (saved && saved.q === city) return saved;
  } catch {
    /* buscar otra vez */
  }
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&country=ES&name=' + encodeURIComponent(city));
  const d = await r.json();
  const p = d.results && d.results[0];
  const geo = p ? { q: city, name: p.name, lat: p.latitude, lon: p.longitude } : { q: city, name: 'Málaga', lat: 36.72, lon: -4.42 };
  writeFlag(GEO_KEY, JSON.stringify(geo));
  return geo;
}

async function weather(entry, r) {
  try {
    const g = await cityCoords();
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lon +
      '&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2');
    if (!res.ok) throw new Error('meteo');
    const w = weatherText(await res.json(), r.when, g.name, r.rain);
    entry.html = rich(w.text);
    paint();
    speak(w.speech);
  } catch {
    entry.html = 'No he podido mirar el tiempo ahora. ¿Tienes internet?';
    paint();
    speak('No he podido mirar el tiempo ahora.');
  }
}

// ---------- oído ----------

let rec = null;
let misses = 0; // escuchas seguidas sin oír nada
let recLive = false; // el micro llegó a arrancar de verdad

/** Has terminado de hablar: cerrar el micro y procesar lo oído. */
function finishListening() {
  if (!rec) return;
  setState('thinking', 'Un momento…');
  try { rec.stop(); } catch { stopListening(); }
}

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
  // Tocar mientras escucha = parar. Si una escucha anterior se quedó colgada, se descarta y se empieza otra.
  if (rec && recLive && ui && ui.root.dataset.state === 'listening') { finishListening(); return; }
  stopListening();
  recLive = false;
  let started = false;
  let heard = false;
  let failed = '';
  let finals = [];
  const confs = []; // [[alternativa1, alternativa2…], …] por cada trozo de frase
  let interim = '';
  let silence = null;
  const r = new Recognition();
  rec = r;
  r.lang = 'es-ES';
  r.interimResults = true;
  r.continuous = !isIOS; // en iPhone el modo continuo a veces no termina nunca; allí, el normal
  r.maxAlternatives = 4;
  const quiet = (ms) => { clearTimeout(silence); silence = setTimeout(() => { if (rec === r) try { r.stop(); } catch { /* */ } }, ms); };
  r.onstart = () => { started = true; if (rec === r) recLive = true; setState('listening'); quiet(isIOS ? 9000 : 7000); };
  r.onresult = (e) => {
    heard = true;
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) { finals[i] = Array.from({ length: res.length }, (_, k) => res[k].transcript); confs[i] = res[0].confidence || 0; }
      else interim += res[0].transcript;
    }
    const said = finals.filter(Boolean).map((alts) => alts[0]).join(' ');
    if (ui) ui.live.textContent = (said + ' ' + interim).trim();
    quiet(1400); // 1,4 s sin hablar = has terminado
  };
  r.onerror = (e) => { failed = e.error || 'error'; };
  r.onend = () => {
    clearTimeout(silence);
    if (rec === r) { rec = null; recLive = false; }
    if (!ui) return;
    const parts = finals.filter(Boolean);
    const main = (parts.map((alts) => alts[0]).join(' ') + ' ' + interim).trim() || ui.live.textContent.trim();
    // Variantes: cambiar cada trozo por sus otras posibilidades
    const alts = [];
    parts.forEach((options, i) => options.slice(1).forEach((o) => alts.push(parts.map((x, j) => (j === i ? o : x[0])).join(' '))));
    ui.live.textContent = '';
    const known = confs.filter((c) => c > 0);
    const conf = known.length ? Math.min(...known) : 0;
    if (main) { misses = 0; return handle(main, alts, conf); }
    misses++;
    if (misses >= 2 && failed !== 'aborted') {
      misses = 0;
      return showKeyboard('No consigo oírte bien con el micro de la app. Toca el 🎤 del teclado y dicta: funciona igual.');
    }
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
  // Si el micro no arranca en 4 s, no quedarse en «Te escucho…»: abrir el teclado para dictar
  setTimeout(() => {
    if (rec === r && !started && !heard && ui) {
      stopListening();
      showKeyboard('El micrófono no ha arrancado. Toca el 🎤 del teclado y dicta, o vuelve a tocar la bola.');
    }
  }, 4000);
  // Por si el sistema no cierra solo
  setTimeout(() => { if (rec === r) { try { r.stop(); } catch { /* */ } setTimeout(() => { if (rec === r) { stopListening(); setState('idle'); } }, 1500); } }, 15000);
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
    if (el.matches('[data-sorb]')) return listen(); // escuchar; si ya escucha, «he terminado»; si habla, se calla y te escucha
    if (el.matches('[data-asyes]')) { unlockVoice(); return handle('sí'); }
    if (el.matches('[data-asno]')) { unlockVoice(); return handle('no'); }
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
