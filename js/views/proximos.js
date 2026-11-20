// Próximos servicios y aviso dentro de la app 12 horas antes de cada transfer.
import { $, bottomSheet, readFlag, writeFlag } from '../dom.js';
import { cachedStatus, checkFlights, etaLine, liveEnabled, openFlight } from '../flight.js';
import { leavePlanOf, scheduleReminders } from '../reminders.js';
import { leaveLine } from '../salida.js';
import { S } from '../store.js';
import { serviceTime, timeUntil, upcoming, whenLabel } from '../trips.js';
import { esc, eur } from '../utils.js';
import { chooseRoute } from './transfer.js';

const NOTICE_HOURS = 12;
const LIST_HOURS = 7 * 24; // la tarjeta enseña lo de la próxima semana
const SEEN_KEY = 'avisos12h';

let open = null; // aviso abierto ahora mismo

const seen = () => {
  try {
    return JSON.parse(readFlag(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
};

function markSeen(s) {
  const all = seen();
  const now = Date.now();
  for (const k of Object.keys(all)) if (all[k] < now - 3 * 864e5) delete all[k]; // limpia avisos viejos
  all[s.id + '@' + s.f + s.h] = serviceTime(s);
  writeFlag(SEEN_KEY, JSON.stringify(all));
}

const isSeen = (s) => (s.id + '@' + s.f + s.h) in seen();

/** Tarjeta "Próximos servicios" en la pantalla de Caja. */
export function renderUpcoming() {
  const box = $('#prox');
  if (!box) return;
  const now = Date.now();
  const list = upcoming(S.srv, now, LIST_HOURS).slice(0, 3);
  box.hidden = !list.length;
  if (!list.length) return;
  box.innerHTML =
    '<div class="mut">Próximos servicios</div>' +
    list
      .map(
        (s) =>
          '<div class="next-item"><div><b>' + esc(whenLabel(s, now)) + '</b>' +
          '<small>' + esc(s.o) + ' → ' + esc(s.d) + (s.pa ? ' · ' + esc(s.pa) : '') + '</small>' +
          (s.vu && etaLine(cachedStatus(s.vu, s.f)) ? '<small class="fl-mini">' + esc(s.vu) + ' · ' + etaLine(cachedStatus(s.vu, s.f)) + '</small>' : '') +
          (leaveLine(leavePlanOf(s.id), now) ? '<small class="sal-mini">' + esc(leaveLine(leavePlanOf(s.id), now)) + '</small>' : '') + '</div>' +
          '<button class="small-btn sec" data-go="' + esc(s.id) + '">📍 Llevarme</button></div>',
      )
      .join('');
  checkNotice();
}

/** Si hay un transfer en las próximas 12 h que aún no se ha avisado, muestra el aviso. */
export function checkNotice() {
  if (open || document.visibilityState === 'hidden') return;
  const now = Date.now();
  const next = upcoming(S.srv, now, NOTICE_HOURS).find((s) => !isSeen(s));
  if (!next) return;
  open = bottomSheet(
    '<div class="card alert-card"><div class="mut">🚖 Transfer programado</div>' +
    '<div class="when">' + esc(whenLabel(next, now)) + '</div>' +
    '<div class="mut">' + esc(timeUntil(next, now)) + '</div>' +
    '<div class="mt10"><b>' + esc(next.o) + ' → ' + esc(next.d) + '</b></div>' +
    '<div class="mut">' + [next.pa && 'Pasajero: ' + esc(next.pa), next.vu && 'Vuelo ' + esc(next.vu), next.cl && esc(next.cl), eur(next.i)].filter(Boolean).join(' · ') + '</div>' +
    (next.vu && etaLine(cachedStatus(next.vu, next.f)) ? '<div class="mt8"><b>' + etaLine(cachedStatus(next.vu, next.f)) + '</b></div>' : '') +
    (leaveLine(leavePlanOf(next.id), now) ? '<div class="mt8 sal-mini"><b>' + esc(leaveLine(leavePlanOf(next.id), now)) + '</b></div>' : '') +
    (next.n ? '<div class="mut mt8">' + esc(next.n) + '</div>' : '') +
    '</div>' +
    '<button type="button" id="ntgo">📍 Llevarme a la recogida</button>' +
    (next.vu ? '<button type="button" class="sec" id="ntfl">✈️ Ver vuelo</button>' : '') +
    '<button type="button" class="sec" data-close>Entendido</button>',
    { onClose: () => { markSeen(next); open = null; setTimeout(checkNotice, 400); } },
  );
  open.querySelector('#ntgo').onclick = () => { open.close(); chooseRoute(next); };
  const fl = open.querySelector('#ntfl');
  if (fl) fl.onclick = () => { open.close(); openFlight(next.vu, esc(next.pa || ''), next.f, next.h); };
}

/**
 * Revisa los vuelos de los servicios de las próximas 24 h (y de las últimas 6)
 * y avisa dentro de la app si alguno se retrasa, se adelanta o se cancela.
 */
async function watchFlights() {
  if (!liveEnabled() || document.visibilityState === 'hidden') return;
  const now = Date.now();
  const list = upcoming(S.srv, now - 6 * 36e5, 30).filter((s) => s.vu);
  if (!list.length) return;
  const notices = await checkFlights(list);
  await scheduleReminders(); // la hora de salida se mueve con el vuelo
  renderUpcoming();
  if (!notices.length) return;
  bottomSheet(
    '<div class="card alert-card"><div class="mut">✈️ Cambios en tus vuelos</div>' +
    notices
      .map((n) => '<div class="mt10"><b>' + esc(n.text) + '</b><div class="mut">' + esc(whenLabel(n.service, now)) + ' · ' + esc(n.service.o) + ' → ' + esc(n.service.d) + (n.service.pa ? ' · ' + esc(n.service.pa) : '') + '</div></div>')
      .join('') +
    '</div><button type="button" data-close>Entendido</button>',
  );
}

export function initUpcoming() {
  setTimeout(watchFlights, 2500);
  setInterval(watchFlights, 5 * 6e4);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') watchFlights();
  });
  // Los botones [data-go] de la tarjeta los atiende la pantalla de Transfer.
  setInterval(checkNotice, 60_000);
  // «Sal ya»: recalcular con tu posición y refrescar la tarjeta cada minuto
  setInterval(() => { if (document.visibilityState === 'visible') scheduleReminders().then(renderUpcoming); }, 5 * 6e4);
  setInterval(() => { if (document.visibilityState === 'visible') renderUpcoming(); }, 6e4);
  window.addEventListener('rutivo:salida', renderUpcoming);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNotice();
  });
}
