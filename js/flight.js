// Vuelos: estado en tiempo real, hora estimada de llegada y avisos de cambios.
// - Con FLIGHT_API (intermediario de Cloudflare, ver worker/): datos de
//   AeroDataBox con horas programadas, estimadas y reales.
// - Sin él: solo la ruta (api.adsbdb.com), y el enlace a Flightradar24.
import { FLIGHT_API } from './config.js';
import { bottomSheet, readFlag, writeFlag } from './dom.js';
import { arrivalDelay, arrivalTime, changeNotice, delayLabel, hasLanded, hhmm, isCanceled, statusLabel } from './flightStatus.js';
import { esc } from './utils.js';

const ROUTE_API = 'https://api.adsbdb.com/v0/callsign/';
const FRESH_MS = 4 * 6e4; // no repetir la misma consulta en menos de 4 minutos
const LAST_KEY = 'vuelos'; // último estado visto de cada vuelo (para detectar cambios)

/** "vy 1234" → "VY1234". */
export const normalizeFlight = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const liveEnabled = () => !!FLIGHT_API;

const memory = new Map(); // "FR4250@2026-11-19" → {at, data}

/** Estado del vuelo desde el intermediario (o null si no está configurado o falla). */
export async function fetchStatus(code, date) {
  if (!FLIGHT_API) return null;
  const key = normalizeFlight(code) + '@' + date;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.data;
  const res = await fetch(FLIGHT_API.replace(/\/$/, '') + '/flight?n=' + encodeURIComponent(normalizeFlight(code)) + '&d=' + date);
  if (!res.ok) throw new Error('flight ' + res.status);
  const data = await res.json();
  memory.set(key, { at: Date.now(), data });
  return data;
}

/** Último estado guardado de un vuelo (para enseñar la hora estimada sin consultar). */
export function cachedStatus(code, date) {
  try {
    return JSON.parse(readFlag(LAST_KEY) || '{}')[normalizeFlight(code) + '@' + date] || null;
  } catch {
    return null;
  }
}

function rememberStatus(code, date, data) {
  let all = {};
  try {
    all = JSON.parse(readFlag(LAST_KEY) || '{}');
  } catch {
    /* empezar de cero */
  }
  const limit = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  for (const k of Object.keys(all)) if (k.split('@')[1] < limit) delete all[k];
  all[normalizeFlight(code) + '@' + date] = data;
  writeFlag(LAST_KEY, JSON.stringify(all));
}

/** "✈️ Llega 15:40 (+25 min)" para listas. */
export function etaLine(f) {
  if (!f || !f.found) return '';
  if (isCanceled(f)) return '❌ ' + statusLabel(f.status);
  const t = arrivalTime(f);
  if (t === null) return '';
  const d = arrivalDelay(f);
  return (hasLanded(f) ? '🛬 Aterrizó ' : '✈️ Llega ') + hhmm(t) + (d !== null ? ' (' + delayLabel(d) + ')' : '');
}

const place = (a) => (a ? esc(a.city || a.name) + (a.iata ? ' (' + esc(a.iata) + ')' : '') : '');

function liveHtml(f) {
  if (!f || !f.found) return '<span class="mut">No encuentro este vuelo en esa fecha. Revisa el número.</span>';
  const t = arrivalTime(f);
  const d = arrivalDelay(f);
  const late = d !== null && d >= 5;
  const dep = f.dep && (f.dep.runway || f.dep.revised || f.dep.sched);
  return (
    '<div class="fl-route"><b>' + esc(f.airline || '') + '</b> · ' + esc(statusLabel(f.status)) + '</div>' +
    '<div class="fl-from">Desde <b>' + place(f.from) + '</b> → ' + place(f.to) + '</div>' +
    (isCanceled(f)
      ? '<div class="fl-eta out">❌ ' + esc(statusLabel(f.status)) + '</div>'
      : '<div class="fl-eta ' + (late ? 'out' : 'in') + '">' + (hasLanded(f) ? 'Aterrizó a las ' : 'Llega a las ') + (t ? hhmm(t) : '—') + '</div>' +
        '<div class="mut">' + (f.arr && f.arr.sched ? 'Programado ' + hhmm(Date.parse(f.arr.sched)) : '') + (d !== null ? ' · ' + delayLabel(d) : '') +
        (f.arr && f.arr.terminal ? ' · Terminal ' + esc(f.arr.terminal) : '') + '</div>') +
    (dep ? '<div class="mut mt8">' + (f.dep.runway ? 'Despegó a las ' : 'Sale a las ') + hhmm(Date.parse(dep)) + ' (hora de aquí)</div>' : '') +
    '<div class="mut mt8">Actualizado a las ' + hhmm(Date.now()) + ' · se actualiza solo cada 2 minutos</div>'
  );
}

async function fetchRoute(code) {
  const res = await fetch(ROUTE_API + encodeURIComponent(code));
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.response && data.response.flightroute ? data.response.flightroute : null;
}

const flightradarUrl = (code) => 'https://www.flightradar24.com/data/flights/' + encodeURIComponent(code.toLowerCase());

/** Abre el panel del vuelo `code` del día `date` ("AAAA-MM-DD"). */
export function openFlight(code, extra = '', date = '') {
  const flight = normalizeFlight(code);
  let timer = null;
  const sheet = bottomSheet(
    '<h3>✈️ Vuelo ' + esc(flight) + '</h3>' +
    (extra ? '<div class="mut">' + extra + '</div>' : '') +
    '<div id="flroute" class="mt8">Buscando el vuelo…</div>' +
    '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + flightradarUrl(flight) + '">Ver en el mapa (Flightradar24)</a>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
    { onClose: () => clearInterval(timer) },
  );
  const info = sheet.querySelector('#flroute');

  if (FLIGHT_API && date) {
    const load = () =>
      fetchStatus(flight, date)
        .then((f) => {
          if (!sheet.isConnected) return;
          info.innerHTML = liveHtml(f);
          if (f && f.found) rememberStatus(flight, date, f);
        })
        .catch(() => { if (sheet.isConnected) info.innerHTML = '<span class="mut">No se pudo consultar el vuelo ahora. Inténtalo en un momento.</span>'; });
    load();
    timer = setInterval(load, 2 * 6e4);
    return sheet;
  }

  fetchRoute(flight)
    .then((r) => {
      info.innerHTML = r
        ? '<b>' + esc(r.airline ? r.airline.name : '') + '</b><br>Desde ' + place({ city: r.origin.municipality, iata: r.origin.iata_code }) + ' → ' + place({ city: r.destination.municipality, iata: r.destination.iata_code })
        : '<span class="mut">No tengo datos de este vuelo. Ábrelo en Flightradar24 para verlo en directo.</span>';
    })
    .catch(() => { info.innerHTML = '<span class="mut">Sin conexión para consultar el vuelo.</span>'; });
  return sheet;
}

/**
 * Revisa los vuelos de los servicios indicados y devuelve los avisos de cambio
 * (retraso, adelanto o cancelación) desde la última consulta.
 */
export async function checkFlights(services) {
  if (!FLIGHT_API) return [];
  const notices = [];
  for (const s of services) {
    const code = normalizeFlight(s.vu);
    if (!code) continue;
    try {
      const prev = cachedStatus(code, s.f);
      const cur = await fetchStatus(code, s.f);
      if (!cur || !cur.found) continue;
      const n = changeNotice(prev, cur, code);
      rememberStatus(code, s.f, cur);
      if (n) notices.push({ ...n, service: s, flight: cur });
    } catch {
      /* sin conexión: se intentará en la siguiente revisión */
    }
  }
  return notices;
}
