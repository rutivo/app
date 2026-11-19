// Recordatorios locales: recogidas, bienvenida y hucha.
// Solo funcionan con la app abierta o recién cerrada (no hay servidor de avisos).
import { $, toast } from './dom.js';
import { S, save } from './store.js';
import { today } from './utils.js';

const FIRED_KEY = 'avFired';
const DEFAULT_LEAD_MIN = 30;
const HORIZON_MS = 13 * 36e5; // solo se programan avisos de las próximas 13 h

let timers = [];

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
        await reg.showNotification(title, { body, tag });
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

export function scheduleReminders() {
  timers.forEach(clearTimeout);
  timers = [];
  if (!S.cfg.avisos) return;

  const now = Date.now();
  const day = today();
  const lead = leadMinutes();
  const fired = readFired();
  for (const k of Object.keys(fired)) if (!k.includes(day)) delete fired[k];

  const at = (time) => new Date(day + 'T' + time + ':00').getTime();
  const add = (id, when, title, body) => {
    const delay = when - now;
    if (delay < -60000 || delay > HORIZON_MS || fired[id]) return;
    timers.push(
      setTimeout(() => {
        notify(id, title, body);
        fired[id] = 1;
        writeFired(fired);
      }, Math.max(0, delay)),
    );
  };

  for (const s of S.srv.filter((x) => x.f === day)) {
    if (s.h) add('pk-' + day + '-' + s.id, at(s.h) - lead * 6e4, 'Recogida en ' + lead + ' min', (s.cl || 'Servicio') + ' · ' + s.o + ' a las ' + s.h);
    if (s.sv && s.tl) add('wc-' + day + '-' + s.id, at(s.sv) - 60 * 6e4, 'Mandar bienvenida', (s.pa || 'Pasajero') + ' · vuelo ' + (s.vu || '') + ' sale a las ' + s.sv);
  }
  if (S.huc.length && !S.huc.some((x) => x.f === day && x.i > 0)) add('hu-' + day, at('21:00'), 'Hucha', 'Recuerda meter hoy en la hucha');
  writeFired(fired);
}

export function renderReminders() {
  const on = !!S.cfg.avisos;
  $('#avc').innerHTML =
    '<div class="mut">Recordatorios</div>' +
    (on
      ? '<div style="margin:6px 0"><b>Activados ✓</b></div>' +
        '<label class="f" for="avl">Avisar antes de cada recogida (min)</label>' +
        '<input id="avl" type="number" min="0" inputmode="numeric" value="' + leadMinutes() + '">' +
        '<button class="sec mt10" id="avoff">Desactivar avisos</button>'
      : '<div class="mut" style="margin:6px 0">Un aviso antes de cada recogida, para mandar la bienvenida y para la hucha. Funciona con la app abierta o hace poco que la cerraste.</div>' +
        '<button id="avb">Activar avisos</button>');

  if (on) {
    $('#avl').onchange = () => {
      S.cfg.avlead = Math.max(0, +$('#avl').value || 0);
      save();
      scheduleReminders();
    };
    $('#avoff').onclick = () => {
      S.cfg.avisos = 0;
      save();
      renderReminders();
      scheduleReminders();
      toast('Avisos desactivados.');
    };
  } else {
    $('#avb').onclick = async () => {
      let granted = true;
      try {
        if (window.Notification && Notification.permission !== 'granted') {
          granted = (await Notification.requestPermission()) === 'granted';
        }
      } catch {
        granted = false;
      }
      S.cfg.avisos = 1;
      save();
      renderReminders();
      scheduleReminders();
      toast(granted ? 'Avisos activados ✓' : 'Activados. Permite las notificaciones del navegador para que suenen.');
    };
  }
}
