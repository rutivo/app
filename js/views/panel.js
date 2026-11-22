// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel Transfer: todos tus servicios de un vistazo (el próximo en grande, hoy,
// mañana, la semana y lo que te deben) con todo a mano: enlace para el cliente,
// mensajes, bienvenida, cartel, vuelo, «Llevarme» y cobro. Los botones son los
// mismos de Transfer (data-lnk, data-msg…), así que hacen exactamente lo mismo.
import { $ } from '../dom.js';
import { cachedStatus, etaLine } from '../flight.js';
import { leavePlanOf } from '../reminders.js';
import { leaveLine } from '../salida.js';
import { S } from '../store.js';
import { panelGroups } from '../panel.js';
import { serviceTime, timeUntil, whenLabel } from '../trips.js';
import { esc, eur, fd, sum } from '../utils.js';
import { serviceActions } from './transfer.js';

const flightLine = (s) => (s.vu && etaLine(cachedStatus(s.vu, s.f)) ? esc(s.vu) + ' · ' + etaLine(cachedStatus(s.vu, s.f)) : s.vu ? '✈️ ' + esc(s.vu) : '');

function payTag(s) {
  return '<span class="tag pay ' + (s.p === 'pendiente' ? 'pend' : 'paid') + '" role="button" data-pay="' + esc(s.id) + '">' +
    (s.p === 'pendiente' ? 'Pendiente de cobro' : 'Cobrado: ' + esc(s.p)) + ' ▾</span>';
}

function item(s, now) {
  const fl = flightLine(s);
  const leave = leaveLine(leavePlanOf(s.id), now);
  return '<div class="pa-it"><div class="pa-top"><b>' + esc(whenLabel(s, now)) + '</b><b class="pa-eur">' + eur(s.i) + '</b></div>' +
    '<div>' + (s.pa ? esc(s.pa) + ' · ' : '') + esc(s.o) + ' → ' + esc(s.d) + '</div>' +
    (fl ? '<small class="fl-mini">' + fl + '</small>' : '') +
    (leave ? '<small class="sal-mini">' + esc(leave) + '</small>' : '') +
    '<div class="pa-tags">' + payTag(s) + (s.cl ? ' <span class="tag">' + esc(s.cl) + '</span>' : '') + '</div>' +
    serviceActions(s) + '</div>';
}

function section(title, list, now) {
  if (!list.length) return '';
  return '<h2>' + title + ' <span class="mut">· ' + list.length + '</span></h2><div class="card">' + list.map((s) => item(s, now)).join('') + '</div>';
}

/** Pinta el panel. */
export function renderPanel() {
  const box = $('#panel');
  if (!box) return;
  const now = Date.now();
  const g = panelGroups(S.srv, now);
  const k = g.kpi;
  let html = '<div class="pa-kpis">' +
    '<div><small>Hoy</small><b>' + k.todayCount + '</b><span>' + eur(k.todayMoney) + '</span></div>' +
    '<div><small>Por cobrar</small><b class="' + (k.owed ? 'pa-owed' : '') + '">' + eur(k.owed) + '</b><span>' + (k.owed ? 'toca para cobrar' : 'todo cobrado ✓') + '</span></div>' +
    '<div><small>7 días</small><b>' + k.weekCount + '</b><span>servicios</span></div></div>';

  if (g.next) {
    const s = g.next;
    const started = serviceTime(s) <= now;
    const fl = flightLine(s);
    const leave = leaveLine(leavePlanOf(s.id), now);
    html += '<div class="card pa-next"><div class="pa-top"><span class="pa-k">' + (started ? 'AHORA' : 'PRÓXIMA RECOGIDA') + '</span>' +
      (started ? '' : '<span class="pa-in">' + esc(timeUntil(s, now)) + '</span>') + '</div>' +
      '<div class="pa-when">' + esc(whenLabel(s, now)) + '</div>' +
      '<div class="pa-who">' + (s.pa ? esc(s.pa) : 'Sin nombre de pasajero') + ' <b class="pa-eur">' + eur(s.i) + '</b></div>' +
      '<div class="mut">' + esc(s.o) + ' → ' + esc(s.d) + '</div>' +
      (fl ? '<div class="fl-mini">' + fl + '</div>' : '') +
      (leave ? '<div class="sal-mini"><b>' + esc(leave) + '</b></div>' : '') +
      '<div class="pa-tags">' + payTag(s) + (s.cl ? ' <span class="tag">' + esc(s.cl) + '</span>' : '') + (s.n ? ' <span class="tag">📝 ' + esc(s.n) + '</span>' : '') + '</div>' +
      '<button type="button" class="pa-main" data-lnk="' + esc(s.id) + '">🔗 Enviar enlace al cliente</button>' +
      serviceActions(s).replace(/<button[^>]*data-lnk="[^"]*"[^>]*>[^<]*<\/button>/, '') + '</div>';
  } else {
    html += '<div class="card pa-empty"><b>No tienes servicios próximos.</b><div class="mut">Apúntalos en Transfer (o pega el texto de la agencia) y aquí lo tendrás todo a mano.</div>' +
      '<button type="button" class="sec" data-gotab="tr">🚖 Ir a Transfer</button></div>';
  }

  html += section('Hoy', g.today, now) + section('Mañana', g.tomorrow, now) + section('Esta semana', g.week, now);
  if (g.later) html += '<div class="mut pa-later">Y ' + g.later + (g.later === 1 ? ' servicio más adelante' : ' servicios más adelante') + ' (en Transfer).</div>';
  if (g.debt.length) {
    html += '<h2>Te deben <span class="mut">· ' + eur(sum(g.debt, (s) => s.i || 0)) + '</span></h2><div class="card">' +
      g.debt.slice(0, 15).map((s) => '<div class="pa-it pa-debt"><div class="pa-top"><b>' + fd(s.f) + ' · ' + esc(s.cl || s.pa || 'Servicio') + '</b><b class="pa-eur">' + eur(s.i) + '</b></div>' +
        '<div class="mut">' + esc(s.o) + ' → ' + esc(s.d) + '</div><div class="pa-tags">' + payTag(s) + '</div></div>').join('') +
      (g.debt.length > 15 ? '<div class="mut">… y ' + (g.debt.length - 15) + ' más en Transfer.</div>' : '') + '</div>';
  }
  box.innerHTML = html;
}
