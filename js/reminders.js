// Recordatorios: «Sal ya» hacia cada recogida, bienvenida y hucha.
// - Con los avisos del servidor activados (Web Push), llegan aunque la app esté
//   cerrada, y el «Sal ya» se mueve solo si el vuelo se retrasa.
// - Si el móvil no puede, funcionan con la app abierta o recién cerrada.
import { $, toast } from './dom.js';
import { cachedStatus } from './flight.js';
import { disablePush, enablePush, isIOS, pushActive, pushSupport, syncAlarms } from './push.js';
import { currentPosition, isAirportPickup, leaveBody, leaveSettings, planFor } from './salida.js';
import { S, save } from './store.js';
import { serviceTime } from './trips.js';
import { today } from './utils.js';

const FIRED_KEY = 'avFired';
const DEFAULT_LEAD_MIN = 30;
const HORIZON_MS = 14 * 36e5; // avisos de las próximas 14 h
const PRE_MIN = 15; // «Sal en 15 min» antes del «Sal ya»

let timers = [];
let lastPlans = new Map(); // id del servicio → plan de salida (para la pantalla)

const readFired = () => {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
  } catch {
    return {};
  }
};
const writeFired = (o) => {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(o));
  } catch {
    /* sin almacenamiento */
  }
};

async function notify(tag, title, body) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' });
        return;
      }
    }
  } catch {
    /* seguir con la alternativa */
  }
  try {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(title, { body, tag });
      return;
    }
  } catch {
    /* seguir con la alternativa */
  }
  toast(title + ' — ' + body);
}

const leadMinutes = () => (S.cfg.avlead == null ? DEFAULT_LEAD_MIN : S.cfg.avlead);

/** Plan de salida calculado más reciente de un servicio (o null). */
export const leavePlanOf = (id) => lastPlans.get(id) || null;

/** Todos los avisos de las próximas horas: [{id, at, title, body, pre?, fl?}]. */
export async function buildAlarms(now = Date.now()) {
  const out = [];
  const add = (a) => { if (a.at > now - 6e4 && a.at < now + HORIZON_MS) out.push(a); };
  const lead = leadMinutes();
  const plans = new Map();
  const soon = S.srv.filter((s) => { const t = serviceTime(s); return t > now - 2 * 36e5 && t < now + HORIZON_MS + 2 * 36e5; });
  for (const s of soon) {
    const flight = s.vu ? cachedStatus(s.vu, s.f) : null;
    const p = await planFor(s, flight && flight.found ? flight : null, S.cfg);
    plans.set(s.id, p);
    if (S.cfg.salya !== 0) {
      add({
        id: 'sal-' + s.id + '-' + s.f,
        at: p.leave,
        title: '🚗 ¡Sal ya!' + (s.pa ? ' Recoges a ' + s.pa : ''),
        body: leaveBody(s, p),
        pre: PRE_MIN,
        ...(isAirportPickup(s) && p.off !== null ? { fl: { n: s.vu.toUpperCase().replace(/[^A-Z0-9]/g, ''), d: s.f, off: p.off, who: s.pa || '' } } : {}),
      });
    } else if (s.h) {
      add({ id: 'pk-' + s.f + '-' + s.id, at: serviceTime(s) - lead * 6e4, title: 'Recogida en ' + lead + ' min', body: (s.cl || 'Servicio') + ' · ' + s.o + ' a las ' + s.h });
    }
    if (s.sv && s.tl) add({ id: 'wc-' + s.f + '-' + s.id, at: new Date(s.f + 'T' + s.sv + ':00').getTime() - 60 * 6e4, title: 'Mandar bienvenida', body: (s.pa || 'Pasajero') + ' · vuelo ' + (s.vu || '') + ' sale a las ' + s.sv });
  }
  const day = today();
  if (S.huc.length && !S.huc.some((x) => x.f === day && x.i > 0)) add({ id: 'hu-' + day, at: new Date(day + 'T21:00:00').getTime(), title: 'Hucha', body: 'Recuerda meter hoy en la hucha' });
  const changed = [...plans].some(([k, p]) => { const o = lastPlans.get(k); return !o || Math.abs(o.leave - p.leave) > 3e4; }) || plans.size !== lastPlans.size;
  lastPlans = plans;
  if (changed) window.dispatchEvent(new Event('rutivo:salida')); // la tarjeta de próximos se repinta
  return out;
}

let running = null;
/** Recalcula los avisos: los manda al servidor o, si no se puede, los programa en la app. */
export function scheduleReminders() {
  if (running) return running;
  running = (async () => {
    timers.forEach(clearTimeout);
    timers = [];
    if (!S.cfg.avisos) { lastPlans = new Map(); await buildAlarms(); return; }
    const alarms = await buildAlarms();
    let remote = false;
    try {
      remote = await syncAlarms(alarms);
    } catch {
      remote = false; // sin red: avisos locales mientras tanto
    }
    if (remote) return;
    const now = Date.now();
    const fired = readFired();
    const day = today();
    for (const k of Object.keys(fired)) if (!k.includes(day)) delete fired[k];
    const local = (id, at, title, body) => {
      const delay = at - now;
      if (delay < -60000 || fired[id]) return;
      timers.push(setTimeout(() => { notify(id, title, body); fired[id] = 1; writeFired(fired); }, Math.max(0, delay)));
    };
    for (const a of alarms) {
      if (a.pre) local(a.id + '-pre', a.at - a.pre * 6e4, '🚗 Sal en ' + a.pre + ' min', a.body);
      local(a.id, a.at, a.title, a.body);
    }
    writeFired(fired);
  })().finally(() => { running = null; });
  return running;
}

function settingsHtml() {
  const st = leaveSettings(S.cfg);
  const num = (id, label, v) => '<label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" type="number" min="0" max="120" inputmode="numeric" value="' + v + '">';
  return '<details class="mt10"><summary><b>🚗 Ajustes de «Sal ya»</b></summary>' +
    '<div class="mut mt8">Rutivo calcula a qué hora salir: aterrizaje real del vuelo + el camino desde donde estás (con el tráfico típico de esa hora) + aparcar. Si el vuelo se retrasa, el aviso se mueve solo.</div>' +
    '<label class="chk mt8"><input type="checkbox" id="salon"' + (S.cfg.salya !== 0 ? ' checked' : '') + '> Avisarme de cuándo salir</label>' +
    num('salat', 'Estar en llegadas … min después de aterrizar', st.afterLanding) +
    num('salant', 'En otras recogidas, llegar … min antes', st.early) +
    num('salcol', 'Colchón extra (min)', st.buffer) +
    num('saldef', 'Camino si no sé dónde estás (min)', st.fallback) +
    '</details>';
}

export async function renderReminders() {
  if (!$('#avc')) return;
  const on = !!S.cfg.avisos;
  const support = pushSupport();
  const remote = on && (await pushActive());
  const box = $('#avc'); // tras esperar: la pantalla de Cuenta puede haberse repintado
  if (!box) return;
  let state = '';
  if (on && remote) state = '<div style="margin:6px 0"><b>Activados ✓ · llegan con la app cerrada</b></div>';
  else if (on && support === 'install') state = '<div style="margin:6px 0"><b>Activados (solo con la app abierta)</b></div><div class="mut">Para que lleguen con la app cerrada en iPhone: Compartir → «Añadir a pantalla de inicio», abre Rutivo desde ese icono y vuelve aquí.</div>';
  else if (on && support === 'ok') state = '<div style="margin:6px 0"><b>Activados (solo con la app abierta)</b></div><button class="mt8" id="avpush">🔔 Recibirlos con la app cerrada</button>';
  else if (on) state = '<div style="margin:6px 0"><b>Activados ✓</b></div><div class="mut">Este navegador no admite avisos con la app cerrada.</div>';

  box.innerHTML =
    '<div class="mut">Avisos</div>' +
    (on
      ? state +
        (S.cfg.salya === 0 ? '<label class="f" for="avl">Avisar antes de cada recogida (min)</label><input id="avl" type="number" min="0" inputmode="numeric" value="' + leadMinutes() + '">' : '') +
        settingsHtml() +
        '<button class="sec mt10" id="avoff">Desactivar avisos</button>'
      : '<div class="mut" style="margin:6px 0">🚗 «Sal ya» con el vuelo en directo, la bienvenida y la hucha. Llegan aunque tengas la app cerrada.</div>' +
        '<button id="avb">Activar avisos</button>');

  const $$ = (id) => box.querySelector('#' + id);
  if (on) {
    if ($$('avl')) $$('avl').onchange = () => { S.cfg.avlead = Math.max(0, +$$('avl').value || 0); save(); scheduleReminders(); };
    $$('salon').onchange = () => { S.cfg.salya = $$('salon').checked ? 1 : 0; save(); renderReminders(); scheduleReminders(); };
    for (const [id, k] of [['salat', 'salAt'], ['salant', 'salAnt'], ['salcol', 'salCol'], ['saldef', 'salDef']]) {
      $$(id).onchange = () => { S.cfg[k] = Math.min(120, Math.max(0, +$$(id).value || 0)); save(); scheduleReminders(); };
    }
    if ($$('avpush')) $$('avpush').onclick = () => turnOnPush($$('avpush'));
    $$('avoff').onclick = async () => {
      S.cfg.avisos = 0;
      save();
      try { await disablePush(); } catch { /* nada */ }
      renderReminders();
      scheduleReminders();
      toast('Avisos desactivados.');
    };
  } else {
    $$('avb').onclick = async () => {
      S.cfg.avisos = 1;
      save();
      currentPosition(true); // para «Sal ya»: saber desde dónde sales
      if (pushSupport() === 'ok') await turnOnPush($$('avb'));
      else {
        try { if (window.Notification && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* nada */ }
        toast(pushSupport() === 'install' ? 'Activados. Añade Rutivo a la pantalla de inicio para recibirlos con la app cerrada.' : 'Avisos activados ✓');
      }
      renderReminders();
      scheduleReminders();
    };
  }
}

async function turnOnPush(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Activando…'; }
  try {
    const alarms = await buildAlarms();
    await enablePush(alarms);
    toast('🔔 Listo: te ha llegado una notificación de prueba.');
  } catch (e) {
    const denied = window.Notification && Notification.permission === 'denied';
    toast(denied
      ? 'Notificaciones bloqueadas. ' + (isIOS() ? 'Ajustes → Notificaciones → Rutivo → Permitir.' : 'Permítelas en los ajustes del navegador.')
      : 'No he podido activarlos ahora. Inténtalo en un momento.');
  }
  renderReminders();
}
