// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Asistente de voz de Rutivo, al estilo Siri: pantalla completa, bola que escucha,
// lo que dices en grande y la respuesta hablada. Todo se calcula en el móvil.
import { ask, trimChatter, weatherText } from '../asistente.js';
import { readFlag, writeFlag } from '../dom.js';
import { cachedStatus, etaLine } from '../flight.js';
import { initWake, pauseWake, resumeWake, trainWake, wakeEnabled, wakeLog, wakeModel, wakeStats } from '../despertar.js';
import { audioNeedsReset, audioRunning, createMic, markAudioBroken, resetAudio } from '../microfono.js';
import { currentPosition } from '../ruta.js';
import { cancelHandsFree, handsFree, initHandsFree } from './manosLibres.js';
import { leavePlanOf, scheduleReminders } from '../reminders.js';
import { leaveBody, leaveLine } from '../salida.js';
import { serviceTime } from '../trips.js';
import { openWorth, quickWorth } from './compensa.js';
import { earSupported, prepareEar, transcribe } from '../oido.js';
import { S } from '../store.js';
import { esc } from '../utils.js';
import { amend, execute, undo as undoDone } from '../vozAcciones.js';
import { driverName } from '../welcome.js';

const VOICE_KEY = 'asisVoz';
// Al dar una orden se hacen pausas («apúntame… treinta… en efectivo»): no cortar antes de tiempo
const COMMAND_MIC = { silenceMs: 1400, shortMs: 600, follow: true };
const SUGGEST = ['¿Cuánto llevo hoy?', '¿Qué tengo mañana?', '¿Qué tiempo hace?', '¿Quién me debe?', 'Apunta 50 € en efectivo', '¿Cuánto gané este mes?', '¿Qué puedo decirte?'];
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const history = []; // conversación de esta sesión (solo en memoria; no se guarda audio ni texto) {from:'yo'|'rutivo', html, undo?}
const HISTORY_MAX = 60;
let ctx = {};
let lastDone = null; // lo último apuntado por voz (para «no, eran 45» o «borra lo último»)
let stopped = false; // se tocó «Parar»: lo que estuviera entendiendo ya no se hace
let emptyTries = 0; // veces seguidas que no se entendió nada
let deafRetry = false; // ya se reintentó tras quedarse mudo el micro
/** El hilo de la conversación con lo último apuntado (el asistente lo usa para corregir o quitar). */
const withDone = () => ({ ...ctx, done: lastDone });
let rerenderAll = () => {};
let ui = null;

const voiceOn = () => readFlag(VOICE_KEY) !== '0';
// Oído propio (micro de Rutivo + Whisper dentro del móvil). Si no se puede, el reconocimiento del navegador o el teclado.
const EAR_KEY = 'asisOido';
const useEar = () => earSupported() && readFlag(EAR_KEY) !== '0';
let mic = null;
let earReady = false;
let earLoading = null;
let earBusy = false;
let convo = false; // conversación por voz: tras contestar, vuelve a escuchar solo
// Modo dictado: si el micro de la app no capta nada en este móvil, se usa el 🎤 del teclado (siempre funciona)
const DICT_KEY = 'asisDictado';
// En iPhone, por defecto el dictado del teclado: tras hablar Rutivo, el micro web deja de oír (fallo de iOS)
const dictation = () => !Recognition || readFlag(DICT_KEY) === '1' || (isIOS && readFlag(DICT_KEY) !== '0');

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

/** «No se le olvida escuchar»: en una conversación por voz, tras contestar vuelve a escuchar. */
function keepListening() {
  // En iPhone, tras hablar, el sistema tarda un poco en devolver el micro
  if (convo && ui && useEar() && !earBusy) setTimeout(() => { if (convo && ui && !earBusy) listenEar(true); }, isIOS ? 700 : 300);
}

function speak(text) {
  if (!voiceOn() || !window.speechSynthesis || !text) { setState('idle'); keepListening(); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.03;
    u.volume = 1; // siempre a tope (el volumen real lo pone el botón del móvil)
    // Si el sistema no deja hablar (iPhone sin un toque antes) o no avisa al terminar, no quedarse colgado
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(guard); setState('idle'); keepListening(); };
    let guard = setTimeout(() => { if (!speechSynthesis.speaking) finish(); }, 1500);
    u.onstart = () => { clearTimeout(guard); guard = setTimeout(finish, Math.min(30000, 2500 + text.length * 90)); };
    u.onend = finish;
    u.onerror = finish;
    setState('speaking');
    speechSynthesis.speak(u);
  } catch {
    setState('idle');
    keepListening();
  }
}

// ---------- pantalla ----------

const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function eta(s) {
  const line = etaLine(cachedStatus(s.vu, s.f));
  return line ? '(' + line.replace(/^\S+\s/, '') + ')' : '';
}

const LABELS = { idle: 'Toca la bola y habla', listening: 'Te escucho… (con ruido, toca la bola al terminar)', thinking: 'Pensando…', speaking: 'Hablando… (toca la bola para hablar tú)', asking: 'Te escucho: contesta a la pregunta' };

function setState(state, label) {
  if (!ui) return;
  ui.root.dataset.state = state;
  ui.status.textContent = label || LABELS[state] || '';
}

function paint() {
  if (!ui) return;
  while (history.length > HISTORY_MAX) history.shift();
  ui.chat.innerHTML = history.length
    ? history.map((m, i) => '<div class="siri-msg ' + m.from + '">' + m.html + (m.undo ? '<button type="button" class="small-btn sec" data-asundo="' + i + '">↩️ Deshacer</button>' : '') + '</div>').join('')
    : '<div class="siri-hello">' + (driverName(S.cfg) ? 'Hola, ' + esc(driverName(S.cfg)) + '.<br>' : '') + '¿En qué te ayudo?</div>';
  ui.chat.scrollTop = ui.chat.scrollHeight;
}

function undoAt(i) {
  const m = history[i];
  if (!m || !m.undo) return false;
  const d = m.undo;
  if (!undoDone(d)) {
    m.html += '<br><i>No se ha podido quitar (¿ya estaba borrado?)</i>';
    delete m.undo;
    return false;
  }
  rerenderAll();
  m.html += '<br><i>Quitado ✓</i>';
  delete m.undo;
  if (lastDone === d) lastDone = null;
  return true;
}

/** Ir a una pantalla de la app (Caja, Transfer, Gasolina, Facturas, Panel). */
function goTo(view) {
  const b = document.querySelector('.tabs button[data-v="' + view + '"]');
  if (b) b.click();
}

/**
 * De varias transcripciones posibles (el móvil a veces duda: «bulla»/«falla»),
 * se queda con la primera que tiene sentido.
 */
function best(options, conf = 0) {
  const list = [...new Set(options.map((o) => String(o || '').trim()).filter(Boolean))];
  // Una orden completa vale más que una a medias, y esta más que algo que no se entiende.
  const score = (r) => (r.kind === 'action' || r.kind === 'confirm' || r.kind === 'undo' || r.kind === 'weather' || r.kind === 'worth' || r.kind === 'leave' ? 3 : /No te he entendido/.test(r.text || '') ? 0 : r.pending ? 1 : 2);
  let top = null;
  for (const q of list) {
    const r = ask(q, S, new Date(), { eta, confidence: conf }, withDone());
    if (!top || score(r) > score(top.r)) top = { q, r };
  }
  return top;
}

function handle(text, alternatives = [], conf = 0) {
  stopped = false;
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
    const i = history.findIndex((m) => m.undo && m.undo === lastDone);
    const ok = i >= 0 ? undoAt(i) : !!lastDone && undoDone(lastDone);
    if (ok) { lastDone = null; rerenderAll(); }
    history.push({ from: 'rutivo', html: ok ? '↩️ Hecho, lo he quitado.' : 'No he podido quitarlo (¿ya estaba borrado?).' });
    speech = ok ? 'Hecho, lo he quitado.' : 'No he podido quitarlo.';
  } else if (r.kind === 'amend') {
    const d = amend(lastDone, r.changes);
    if (d) {
      const old = history.find((m) => m.undo === lastDone);
      if (old) old.undo = d;
      lastDone = d;
      rerenderAll();
    }
    history.push({ from: 'rutivo', html: d ? rich(r.text) : 'No he podido corregirlo (¿ya estaba borrado?). No he cambiado nada.' });
    speech = d ? r.speech : 'No he podido corregirlo. No he cambiado nada.';
  } else if (r.kind === 'nav') {
    history.push({ from: 'rutivo', html: rich(r.text) });
    paint();
    closeAssistant();
    goTo(r.view);
    return;
  } else if (r.kind === 'confirm') {
    const undoing = r.ctx && r.ctx.confirm && r.ctx.confirm.undo;
    history.push({ from: 'rutivo', html: rich(r.text) + '<div class="siri-yn"><button type="button" data-asyes>' + (undoing ? '🗑️ Sí, quítalo' : '✅ Sí, apúntalo') + '</button><button type="button" class="sec" data-asno>❌ No</button></div>' });
    speech = r.speech;
  } else if (r.kind === 'worth') {
    const entry = { from: 'rutivo', html: rich(r.text) };
    history.push(entry);
    paint();
    worthAnswer(entry, r);
    return;
  } else if (r.kind === 'leave') {
    const entry = { from: 'rutivo', html: '🚗 Lo miro…' };
    history.push(entry);
    paint();
    leaveAnswer(entry);
    return;
  } else if (r.kind === 'weather') {
    const entry = { from: 'rutivo', html: rich(r.text) };
    history.push(entry);
    paint();
    weather(entry, r);
    return;
  } else {
    const entry = { from: 'rutivo', html: rich(r.text) };
    speech = r.speech;
    if (r.kind === 'action') {
      // Solo se dice «apuntado» si de verdad ha quedado guardado
      const d = execute(r.action);
      if (d) {
        lastDone = d;
        entry.undo = d;
        rerenderAll();
      } else {
        entry.html = '⚠️ No he podido guardarlo (falta espacio en el móvil). <b>No está apuntado.</b> Inténtalo otra vez o apúntalo a mano.';
        speech = 'No he podido guardarlo. No está apuntado.';
      }
    }
    history.push(entry);
  }
  paint();
  speak(speech);
}

// ---------- ¿me compensa? y ¿a qué hora salgo? ----------

async function worthAnswer(entry, r) {
  try {
    const { text } = await quickWorth(r);
    entry.html = '💶 ' + esc(text) + '<div class="siri-yn"><button type="button" data-asworth>Ver el detalle</button></div>';
    entry.worth = r;
    paint();
    speak(text);
  } catch (err) {
    const msg = err.message && err.message.startsWith('No ') ? err.message + '. Dímelo con el pueblo o la dirección.' : 'No puedo calcular la ruta ahora (¿sin conexión?).';
    entry.html = esc(msg);
    paint();
    speak(msg);
  }
}

async function leaveAnswer(entry) {
  await scheduleReminders();
  const now = Date.now();
  const next = S.srv.filter((s) => serviceTime(s) > now - 2 * 36e5 && serviceTime(s) < now + 24 * 36e5)
    .map((s) => ({ s, p: leavePlanOf(s.id) })).filter((x) => x.p && x.p.leave > now - 30 * 6e4)
    .sort((a, b) => a.p.leave - b.p.leave)[0];
  let text;
  if (!next) text = 'No tienes recogidas en las próximas horas.';
  else {
    const line = leaveLine(next.p, now).replace(/^🚗 /, '');
    text = line + '. ' + leaveBody(next.s, next.p).replace(/ · \d+ min de camino$/, '') + '.' + (next.p.guess ? ' (No sé dónde estás: cuento ' + next.p.travel + ' min de camino.)' : '');
  }
  entry.html = '🚗 ' + esc(text);
  paint();
  speak(text.replace(/\(.*?\)/g, '').replace(/·/g, ','));
}

// ---------- el tiempo ----------

const GEO_KEY = 'meteoGeo';
const HERE_KEY = 'meteoAqui';
const round2 = (v) => Math.round(v * 100) / 100; // ~1 km: a los servicios del tiempo no les llega tu posición exacta

/**
 * Dónde mirar el tiempo: el sitio que digas («en Sevilla»); si no, dónde estás
 * (GPS del móvil, pide permiso la primera vez); si no se puede, tu ciudad de los
 * datos de emisor o Málaga. `guess`: no se sabe dónde estás.
 */
async function weatherWhere(place) {
  if (place) return { ...(await cityCoords(place)), asked: true };
  const pos = await currentPosition(true, 30).catch(() => null);
  if (pos) {
    const lat = round2(pos.lat);
    const lon = round2(pos.lon);
    let name = '';
    try {
      const saved = JSON.parse(readFlag(HERE_KEY) || 'null');
      if (saved && saved.lat === lat && saved.lon === lon) name = saved.name;
    } catch { /* se busca otra vez */ }
    if (!name) {
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=es&lat=' + lat + '&lon=' + lon);
        const a = (await r.json()).address || {};
        name = a.city || a.town || a.village || a.municipality || a.county || '';
        if (name) writeFlag(HERE_KEY, JSON.stringify({ lat, lon, name }));
      } catch { /* sin nombre: «tu zona» */ }
    }
    return { name: name || 'tu zona', lat, lon };
  }
  return { ...(await cityCoords()), guess: true };
}

/** Coordenadas de una ciudad (por defecto la de tus datos de emisor; si no hay, Málaga). Se guardan. */
async function cityCoords(wanted) {
  const city = (wanted || '').trim() || (S.cfg.loc || '').trim() || 'Málaga';
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
    const g = await weatherWhere(r.place);
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lon +
      '&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2');
    if (!res.ok) throw new Error('meteo');
    const w = weatherText(await res.json(), r.when, g.name, r.rain);
    // Sin ubicación: se dice de dónde es el tiempo y cómo arreglarlo
    entry.html = rich(w.text) + (g.guess ? '<br><small>📍 No sé dónde estás (sin permiso de ubicación): es el tiempo de ' + esc(g.name) + '. Para el de donde estés: Ajustes → Privacidad → Localización → Safari → «Al usar la app». O dime «¿qué tiempo hace en Madrid?».</small>' : '');
    paint();
    speak(w.speech);
  } catch {
    entry.html = 'No he podido mirar el tiempo ahora. ¿Tienes internet?';
    paint();
    speak('No he podido mirar el tiempo ahora.');
  }
}

// ---------- oído propio (micro de Rutivo + Whisper) ----------

function earProgress(p) {
  if (earReady || !ui || !p.total || p.total < 5e6) return;
  const pct = Math.round((p.loaded / p.total) * 100);
  if (ui.root.dataset.state !== 'listening') setState('thinking', '⬇️ Descargando el oído de Rutivo… ' + pct + ' % (solo la primera vez)');
}

/** Escucha con el micro propio. `auto`: viene de la conversación (sin toque). */
async function listenEar(auto = false) {
  if (earBusy) {
    // Tocar la bola mientras escucha = «ya he terminado»
    if (mic && ui && ui.root.dataset.state === 'listening') mic.stop();
    return;
  }
  earBusy = true;
  try {
    mic = mic || createMic(COMMAND_MIC);
    if (!earLoading) {
      earLoading = prepareEar(earProgress).then(() => { earReady = true; });
      earLoading.catch(() => { earLoading = null; });
    }
    setState('listening', earReady ? 'Te escucho…' : 'Te escucho… (la primera vez preparo el oído de Rutivo)');
    let audio;
    try {
      audio = await mic.listen((rms, speaking) => {
        if (!ui) return;
        ui.root.style.setProperty('--lvl', Math.min(1, rms * 9).toFixed(2));
        if (speaking && ui.status.textContent.startsWith('Te escucho')) ui.status.textContent = '🗣️ Te oigo… (toca la bola si has terminado)';
      });
    } catch (err) {
      earBusy = false;
      convo = false;
      if (ui) ui.root.style.setProperty('--lvl', '0');
      if (err && err.name === 'DeafMicError') {
        // El sistema dejó el micro mudo (en iPhone, tras hablar): se espera un poco y se reintenta solo una vez
        if (mic) { mic.close(); mic = null; }
        if (!deafRetry && ui) {
          deafRetry = true;
          convo = true;
          setState('thinking', '🎙️ Recuperando el micro…');
          setTimeout(() => { if (ui && convo) listenEar(true); }, 900);
          return;
        }
        deafRetry = false;
        markAudioBroken();
        return setState('idle', auto ? '👆 Toca la bola para seguir hablando' : 'El micro no da sonido. Toca la bola otra vez (si sigue, cierra y abre Rutivo).');
      }
      if (err && err.name === 'NotAllowedError') return showKeyboard('No tengo permiso para el micrófono. Ajustes → Safari → Micrófono → Permitir (o «Preguntar») y vuelve a tocar la bola. Mientras, usa el 🎤 del teclado.');
      return showKeyboard('No puedo abrir el micrófono (¿lo usa otra app?). Usa el 🎤 del teclado.');
    }
    deafRetry = false;
    if (ui) ui.root.style.setProperty('--lvl', '0');
    if (!ui) { earBusy = false; return; }
    if (!audio) {
      earBusy = false;
      convo = false; // si en la conversación ya no dices nada, deja de escuchar
      if ((mic && mic.lastPeak < 0.0008) || !audioRunning()) markAudioBroken(); // silencio absoluto o audio parado (iPhone interrumpido): el próximo toque rehace el audio
      return setState('idle', auto ? LABELS.idle : 'No te he oído. Toca la bola y habla cerca del móvil.');
    }
    setState('thinking', earReady ? 'Entendiendo…' : '⬇️ Preparando el oído de Rutivo (solo la primera vez)…');
    await earLoading;
    const text = await transcribe(audio);
    earBusy = false;
    if (!ui) return;
    if (stopped) return setState('idle', 'Parado. Toca la bola para hablar.');
    if (!text) {
      // En plena conversación, una vez: lo vuelve a intentar solo (sin tener que tocar la bola)
      if ((auto || convo) && emptyTries < 1) {
        emptyTries++;
        convo = true; // al terminar de hablar, vuelve a escuchar
        speak('No te he entendido. Repítemelo.');
        return;
      }
      emptyTries = 0;
      convo = false;
      return setState('idle', 'No te he entendido. Toca la bola y repítelo.');
    }
    emptyTries = 0;
    convo = true;
    const clean = trimChatter(text);
    handle(clean, [], clean !== text ? 0.4 : undefined); // si había charla de fondo, pide confirmar
  } catch {
    earBusy = false;
    convo = false;
    if (ui) showKeyboard('No he podido preparar el oído de Rutivo (¿sin internet la primera vez?). De momento usa el 🎤 del teclado.');
  }
}

// ---------- oído del navegador (si no hay oído propio) ----------

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
  ui.input.focus(); // dentro del toque: el iPhone abre el teclado
  setTimeout(() => ui.input.focus(), 30);
}

/** Pasar al dictado del teclado (y recordarlo en este móvil). */
function useDictation(why) {
  writeFlag(DICT_KEY, '1');
  if (ui) ui.root.classList.add('dict');
  showKeyboard(why || 'Toca el 🎤 del teclado y habla. Se envía solo cuando terminas.');
}

/** Empieza a escuchar. Se llama SIEMPRE desde un toque (lo exige el iPhone). */
function listen() {
  unlockVoice();
  // Tras una interrupción del iPhone (una notificación) o una escucha fallida: audio y micro de cero, dentro de este toque
  if (audioNeedsReset()) { resetAudio(); if (mic) { mic.close(); mic = null; } }
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (useEar()) return listenEar();
  if (dictation()) return showKeyboard('Toca el 🎤 del teclado y habla. Se envía solo cuando terminas.');
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
  let sound = false;
  r.onaudiostart = () => {
    if (!heard) setState('listening', '🎙️ Micro abierto… habla');
    // Micro abierto pero sin ningún sonido en 5 s: el fallo del iPhone → al teclado, sin esperar más
    setTimeout(() => {
      if (rec === r && !sound && !heard && ui) {
        stopListening();
        useDictation('El micro de la app se abre pero no oye nada en este móvil. Usa el 🎤 del teclado: habla y se envía solo.');
      }
    }, 5000);
  };
  r.onsoundstart = () => { sound = true; if (!heard) setState('listening', '🔊 Oigo sonido…'); };
  r.onspeechstart = () => { sound = true; if (!heard) setState('listening', '🗣️ Oigo voz…'); };
  r.onresult = (e) => {
    heard = true;
    sound = true;
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
      return useDictation('El micro de la app no capta nada en este móvil. A partir de ahora: toca el 🎤 del teclado y habla (se envía solo).');
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
      if (++misses >= 2) { misses = 0; return useDictation('El micro de la app no arranca en este móvil. A partir de ahora: toca el 🎤 del teclado y habla (se envía solo).'); }
      showKeyboard('El micrófono no ha arrancado. Toca el 🎤 del teclado y dicta, o vuelve a tocar la bola.');
    }
  }, 4000);
  // Por si el sistema no cierra solo
  setTimeout(() => { if (rec === r) { try { r.stop(); } catch { /* */ } setTimeout(() => { if (rec === r) { stopListening(); setState('idle'); } }, 1500); } }, 15000);
}

// ---------- abrir / cerrar ----------

/**
 * Abre el asistente. `cmd` (texto): viene de «Oye Rutivo»; si trae orden
 * («Oye Rutivo, apúntame 20 €») la hace; si no, pregunta «¿Sí?» y escucha.
 */
export function openAssistant(cmd) {
  const fromWake = typeof cmd === 'string';
  pauseWake(); // el asistente usa su propio micro
  if (!fromWake) unlockVoice();
  if (ui) return fromWake && cmd ? handle(cmd) : listen();
  const root = document.createElement('div');
  root.className = 'siri';
  root.setAttribute('role', 'dialog');
  root.innerHTML =
    '<div class="siri-top"><button type="button" class="siri-x" data-sx aria-label="Cerrar">✕</button>' +
    '<b>Rutivo <span class="siri-mic" aria-hidden="true">● micro</span></b><span class="siri-tools"><button type="button" class="siri-voz" data-sclear aria-label="Borrar la conversación" title="Borrar la conversación">🗑️</button><button type="button" class="siri-voz" data-svoz></button></span></div>' +
    '<div class="siri-chat"></div>' +
    '<div class="siri-live" aria-live="polite"></div>' +
    '<div class="siri-sug">' + SUGGEST.map((q) => '<button type="button" data-asq="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
    '<form class="siri-form" hidden><input autocomplete="off" enterkeyhint="send" placeholder="Escribe o dicta con el 🎤 del teclado"><button aria-label="Enviar">➤</button></form>' +
    '<div class="siri-status"></div>' +
    '<button type="button" class="siri-wake" data-swake></button>' +
    '<button type="button" class="siri-wake" data-strain></button>' +
    '<div class="siri-heard"></div>' +
    '<button type="button" class="siri-retry" data-sretry>🎙️ Usar el micro de la app</button>' +
    '<div class="siri-bottom"><button type="button" class="siri-kb" data-skb aria-label="Escribir">⌨️</button>' +
    '<button type="button" class="siri-orb" data-sorb aria-label="Hablar"><i></i><i></i><i></i><span class="siri-wave" aria-hidden="true">' + '<b></b>'.repeat(9) + '</span></button>' +
    '<button type="button" class="siri-kb siri-stop" data-sstop aria-label="Parar">⏹</button></div>';
  document.body.appendChild(root);
  ui = { root, chat: root.querySelector('.siri-chat'), live: root.querySelector('.siri-live'), status: root.querySelector('.siri-status'),
    form: root.querySelector('.siri-form'), input: root.querySelector('.siri-form input'), voz: root.querySelector('[data-svoz]') };
  const paintVoz = () => { ui.voz.textContent = voiceOn() ? '🔊' : '🔇'; ui.voz.title = voiceOn() ? 'Voz activada' : 'Sin voz'; };
  paintVoz();
  const wakeBtn = root.querySelector('[data-swake]');
  const paintWake = () => { wakeBtn.textContent = wakeEnabled() ? '👂 «Oye Rutivo» activado' : '👂 Activar «Oye Rutivo»'; wakeBtn.classList.toggle('on', wakeEnabled()); };
  paintWake();
  const trainBtn = root.querySelector('[data-strain]');
  const paintTrain = () => {
    trainBtn.textContent = wakeModel() ? '🎯 «Oye Rutivo» con tu voz ✓ · Volver a entrenar' : '🎯 Entrena «Oye Rutivo» con tu voz (contesta en 1 s)';
    trainBtn.classList.toggle('on', !!wakeModel());
  };
  paintTrain();
  // Lo último que oyó «Oye Rutivo» fuera de esta pantalla (para saber qué entiende si no responde)
  const heardTexts = wakeLog().filter((h) => h.text).slice(-3).map((h) => '«' + h.text.trim().slice(0, 60) + '»');
  const st = wakeStats();
  const num = (v) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(2).replace('.', ','));
  root.querySelector('.siri-heard').textContent = (heardTexts.length ? '👂 Lo último que oí fuera: ' + heardTexts.join(' · ') : '') +
    (st ? (heardTexts.length ? '\n' : '') + '🎯 Detector: lo más parecido hace poco ' + num(st.last) + ' · contesta si baja de ' + num(st.thr) + (st.ok != null ? ' · tu prueba ' + num(st.ok) : '') : '');
  root.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.matches('[data-sx]')) return closeAssistant();
    if (el.matches('[data-swake]')) {
      writeFlag('oyeRutivo', wakeEnabled() ? '0' : '1');
      paintWake();
      return setState('idle', wakeEnabled() ? 'Listo: con la app abierta, di «Oye Rutivo» y te escucho.' : '«Oye Rutivo» desactivado. Toca el icono para hablar.');
    }
    if (el.matches('[data-strain]')) {
      if (trainBtn.disabled) return;
      stopListening();
      convo = false;
      trainBtn.disabled = true;
      const say = ['', 'otra vez', 'una última vez'];
      trainWake((i, st) => {
        if (!ui) return;
        if (st === 'escucha') setState('listening', '🎯 Di «Oye Rutivo» ' + (say[i] || '') + ' (' + (i + 1) + ' de 3)');
        else if (st === 'prueba') setState('listening', '🎯 Ahora dilo una vez más, para comprobar cómo te oye este móvil');
        else if (st === 'otra') setState('idle', '🤔 No te he oído bien. Dilo otra vez, normal, como lo dirías en el coche.');
        else if (i <= 3) setState('idle', '✔ ' + i + ' de 3');
      }).then((ok) => {
        trainBtn.disabled = false;
        paintTrain();
        if (ui) setState('idle', ok ? '✅ Listo. Con la app abierta, di «Oye Rutivo» y te contesto al momento.' : 'No se pudo entrenar. Prueba otra vez en un sitio con menos ruido.');
      }, () => { trainBtn.disabled = false; if (ui) setState('idle', 'No se pudo usar el micro. Toca otra vez.'); });
      return;
    }
    if (el.matches('[data-sstop]')) return stopAll();
    if (el.matches('[data-sclear]')) { history.length = 0; ctx = {}; paint(); return setState('idle', 'Conversación borrada.'); }
    if (el.matches('[data-svoz]')) { writeFlag(VOICE_KEY, voiceOn() ? '0' : '1'); paintVoz(); try { speechSynthesis.cancel(); } catch { /* */ } return setState('idle'); }
    if (el.matches('[data-sorb]')) return listen(); // escuchar; si ya escucha, «he terminado»; si habla, se calla y te escucha
    if (el.matches('[data-sretry]')) { writeFlag(DICT_KEY, '0'); root.classList.remove('dict'); ui.form.hidden = true; return listen(); }
    if (el.matches('[data-asyes]')) { unlockVoice(); return handle('sí'); }
    if (el.matches('[data-asno]')) { unlockVoice(); return handle('no'); }
    if (el.matches('[data-skb]')) { if (ui.form.hidden) showKeyboard(); else ui.form.hidden = true; return; }
    if (el.matches('[data-asq]')) { unlockVoice(); convo = false; return handle(el.dataset.asq); }
    if (el.matches('[data-asundo]')) { undoAt(+el.dataset.asundo); paint(); }
    if (el.matches('[data-asworth]')) { const w = [...history].reverse().find((m) => m.worth); if (w) openWorth({ price: w.worth.price, from: w.worth.from, to: w.worth.to }); }
  });
  const send = () => {
    clearTimeout(autoSend);
    const v = ui.input.value;
    ui.input.value = '';
    handle(v);
  };
  let autoSend = null;
  ui.form.onsubmit = (e) => {
    e.preventDefault();
    unlockVoice();
    convo = false;
    send();
  };
  // El dictado del teclado va escribiendo; cuando deja de escribir 1,8 s, se envía solo
  ui.input.addEventListener('input', (e) => {
    clearTimeout(autoSend);
    if (!dictation() || !ui.input.value.trim()) return;
    if (e.inputType === 'insertText' && e.data && e.data.length === 1) return; // tecleando a mano: espera a «Enviar»
    setState('idle', '✍️ ' + ui.input.value.trim().slice(-60));
    autoSend = setTimeout(send, 1800);
  });
  ui.input.addEventListener('focus', unlockVoice);
  if (!useEar() && dictation()) root.classList.add('dict');
  paint();
  setState('idle');
  if (fromWake && cmd) { convo = true; handle(cmd); } // «Oye Rutivo, apúntame…»: la orden directamente
  else if (fromWake && useEar()) { convo = true; speak('Dime, ¿en qué puedo ayudarte?'); } // contesta y se queda escuchando
  else listen(); // al abrir ya escucha (el toque en el botón cuenta como permiso)
}

/** «Parar»: se calla, deja de escuchar y no hace lo que estuviera entendiendo. */
function stopAll() {
  stopped = true;
  convo = false;
  try { speechSynthesis.cancel(); } catch { /* */ }
  stopListening();
  if (mic) mic.cancel();
  if (ui) ui.root.style.setProperty('--lvl', '0');
  setState('idle', 'Parado. Toca la bola para hablar.');
}

export function closeAssistant() {
  stopListening();
  convo = false;
  if (mic) { mic.close(); mic = null; }
  earBusy = false;
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (ui) ui.root.remove();
  ui = null;
  resumeWake(); // vuelve a esperar «Oye Rutivo»
}

export function initAssistant(rerender) {
  rerenderAll = rerender;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'asisbtn';
  b.className = 'asis-fab';
  b.setAttribute('aria-label', 'Hablar con Rutivo');
  b.innerHTML = '<i></i>';
  b.onclick = () => { cancelHandsFree(); openAssistant(); };
  document.body.appendChild(b);
  // «Oye Rutivo»: el icono enseña si está escuchando (anillo) o si necesita un toque
  // Manos libres: «Oye Rutivo» habla contigo sin abrir esta pantalla
  initHandsFree(rerender, (text) => openAssistant(text));
  // Mientras se descarga el reconocedor de voz (la primera vez, ~77 MB), se ve cuánto falta
  const files = new Map();
  let pill = null;
  const progress = (p) => {
    if (!p) { files.clear(); if (pill) { pill.remove(); pill = null; } return; }
    if (p.file && p.total) files.set(p.file, [p.loaded || 0, p.total]);
    let got = 0;
    let all = 0;
    for (const [l, t] of files.values()) { got += l; all += t; }
    if (!all || got >= all) return;
    if (!pill) { pill = document.createElement('div'); pill.className = 'ear-dl'; document.body.appendChild(pill); }
    pill.textContent = '⬇️ Preparando «Oye Rutivo»… ' + Math.floor((got / all) * 100) + '% (solo la primera vez)';
  };
  let hint = null;
  initWake((rest) => handsFree(rest), (state) => {
    b.dataset.wake = state;
    // Si el iPhone necesita un toque para dejar escuchar, se dice (antes no se veía nada)
    if (state === 'tap' && !hint && !pill) {
      hint = document.createElement('div');
      hint.className = 'ear-dl';
      hint.textContent = '👆 Toca la pantalla para que «Oye Rutivo» te escuche';
      document.body.appendChild(hint);
    } else if (state !== 'tap' && hint) { hint.remove(); hint = null; }
    b.title = state === 'listening' ? 'Di «Oye Rutivo»' : state === 'tap' ? 'Toca para hablar (y activar «Oye Rutivo»)' : 'Hablar con Rutivo';
  }, progress);
  if (window.speechSynthesis) try { speechSynthesis.getVoices(); } catch { /* */ }
}
