// Vuelos: estado en tiempo real, hora estimada de llegada, avisos de cambios y mapa.
// - Con FLIGHT_API (intermediario de Cloudflare, ver worker/): datos de
//   AeroDataBox con horas programadas, estimadas y reales.
// - Para no gastar consultas: la primera, 12 h antes del servicio (hora
//   prevista); después, nada hasta la hora de despegue. Al aterrizar, se para.
// - Con el avión en el aire, el mapa se mueve con la posición ADS-B (gratis).
// - Sin intermediario: solo la ruta (api.adsbdb.com), y el enlace a Flightradar24.
import { FLIGHT_API } from './config.js';
import { bottomSheet, loadScript, readFlag, writeFlag } from './dom.js';
import {
  arrivalDelay, arrivalTime, changeNotice, delayLabel, estDeparture, flightProgress, hasLanded, hhmm, isAirborne, isCanceled, probablyLanded, shouldTrack, statusLabel,
} from './flightStatus.js';
import { serviceTime } from './trips.js';
import { esc } from './utils.js';

const ROUTE_API = 'https://api.adsbdb.com/v0/callsign/';
const LEAFLET = 'vendor/leaflet-1.9.4';
// Mapas sin clave: OpenStreetMap y, si falla, Esri.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_BACKUP = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const FRESH_MS = 4 * 6e4; // no repetir la misma consulta en menos de 4 minutos
const POS_MS = 30e3; // el avión se mueve en el mapa cada 30 s
const LAST_KEY = 'vuelos'; // último estado visto de cada vuelo (para detectar cambios)

/** "vy 1234" → "VY1234". */
export const normalizeFlight = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const liveEnabled = () => !!FLIGHT_API;
const api = (path) => FLIGHT_API.replace(/\/$/, '') + path;

const memory = new Map(); // "FR4250@2026-11-19" → {at, data}

/** Estado del vuelo desde el intermediario (o null si no está configurado). */
export async function fetchStatus(code, date) {
  if (!FLIGHT_API) return null;
  const key = normalizeFlight(code) + '@' + date;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.data;
  const res = await fetch(api('/flight?n=' + encodeURIComponent(normalizeFlight(code)) + '&d=' + date));
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
  all[normalizeFlight(code) + '@' + date] = { ...data, at: Date.now() };
  writeFlag(LAST_KEY, JSON.stringify(all));
}

/**
 * Estado del vuelo gastando consultas solo cuando hace falta (ver shouldTrack).
 * Devuelve {f, live}: live = false si es el último guardado, sin consultar.
 */
async function trackedStatus(code, date, time = '') {
  const prev = cachedStatus(code, date);
  const serviceMs = time ? serviceTime({ f: date, h: time }) : null;
  if (!shouldTrack(prev, Date.now(), serviceMs)) return { f: prev, prev, live: false };
  const f = await fetchStatus(code, date);
  if (f) rememberStatus(code, date, f);
  return { f, prev, live: true };
}

/** "✈️ Llega 15:40 (+25 min)" para listas. */
export function etaLine(f) {
  if (!f || !f.found) return '';
  if (isCanceled(f)) return '❌ ' + statusLabel(f.status);
  const t = arrivalTime(f);
  if (t === null) return '';
  const d = arrivalDelay(f);
  if (probablyLanded(f)) return '🛬 Aterrizó hacia las ' + hhmm(t);
  return (hasLanded(f) ? '🛬 Aterrizó ' : isAirborne(f) ? '✈️ En el aire · llega ' : '✈️ Llega ') + hhmm(t) + (d !== null ? ' (' + delayLabel(d) + ')' : '');
}

const place = (a) => (a ? esc(a.city || a.name) + (a.iata ? ' (' + esc(a.iata) + ')' : '') : '');

function liveHtml(f, live) {
  if (!f || !f.found) return '<span class="mut">No encuentro este vuelo en esa fecha. Revisa el número.</span>';
  const t = arrivalTime(f);
  const d = arrivalDelay(f);
  const late = d !== null && d >= 5;
  const dep = estDeparture(f);
  const landedEst = probablyLanded(f);
  const sched = f.dep && f.dep.sched ? Date.parse(f.dep.sched) : null;
  const waiting = !live && !hasLanded(f) && !isCanceled(f) && dep && Date.now() < dep;
  const depLine = !dep ? ''
    : f.dep.runway ? 'Despegó a las ' + hhmm(dep)
      : sched && dep - sched >= 5 * 6e4 ? 'Salida prevista a las ' + hhmm(dep) + ' (programada ' + hhmm(sched) + ')'
        : 'Sale a las ' + hhmm(dep);
  return (
    '<div class="fl-route"><b>' + esc(f.airline || '') + '</b> · ' + esc(statusLabel(f.status)) + (f.model ? ' · ' + esc(f.model) : '') + '</div>' +
    '<div class="fl-from">Desde <b>' + place(f.from) + '</b> → ' + place(f.to) + '</div>' +
    (isCanceled(f)
      ? '<div class="fl-eta out">❌ ' + esc(statusLabel(f.status)) + '</div>'
      : '<div class="fl-eta ' + (late && !landedEst ? 'out' : 'in') + '">' + (hasLanded(f) ? 'Aterrizó a las ' : landedEst ? '🛬 Aterrizó hacia las ' : 'Llega a las ') + (t ? hhmm(t) : '—') + '</div>' +
        (landedEst ? '<div class="mut">Hora estimada: la aerolínea aún no ha confirmado el aterrizaje.</div>' : '') +
        '<div class="mut">' + (f.arr && f.arr.sched ? 'Programado ' + hhmm(Date.parse(f.arr.sched)) : '') + (d !== null ? ' · ' + delayLabel(d) : '') +
        (f.arr && f.arr.terminal ? ' · Terminal ' + esc(f.arr.terminal) : '') + '</div>') +
    (depLine ? '<div class="mut mt8">' + depLine + ' (hora de aquí)</div>' : '') +
    (waiting
      ? '<div class="fl-wait mt8">📡 El seguimiento en directo y el mapa se activan al despegar (' + hhmm(dep) + ').</div>'
      : hasLanded(f) || isCanceled(f) || landedEst
        ? ''
        : '<div class="mut mt8">Actualizado a las ' + hhmm(f.at || Date.now()) + ' · se actualiza solo mientras vuela</div>')
  );
}

// ---------- mapa del vuelo ----------

function loadLeaflet() {
  if (!document.querySelector('link[data-leaflet]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = LEAFLET + '.css';
    l.dataset.leaflet = '1';
    document.head.appendChild(l);
  }
  return loadScript(LEAFLET + '.js');
}

const PLANE_SVG =
  '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="#1d5fe0" stroke="#fff" stroke-width="1" d="M12 2c.8 0 1.3.9 1.3 2v5.2l7.7 4.6v2l-7.7-2.4v4.9l2.3 1.7V22L12 21l-3.6 1v-2l2.3-1.7v-4.9L3 15.8v-2l7.7-4.6V4c0-1.1.5-2 1.3-2z"/></svg>';

/** Mapa con origen, destino y el avión. Devuelve {update(pos)} o null si no se puede pintar. */
async function flightMap(box, f) {
  try {
    await loadLeaflet();
  } catch {
    return null;
  }
  const L = window.L;
  if (!L || !box.isConnected) return null;
  // Sin animaciones: el panel se puede cerrar en cualquier momento sin dejar nada a medias.
  const map = L.map(box, { zoomControl: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  let removed = false;
  map.attributionControl.setPrefix(false);
  const osm = L.tileLayer(TILES, { maxZoom: 12, attribution: '© OpenStreetMap' }).addTo(map);
  let errors = 0;
  osm.on('tileerror', () => {
    if (++errors !== 3 || removed) return; // varias teselas fallan: cambiar al mapa de reserva
    map.removeLayer(osm);
    L.tileLayer(TILES_BACKUP, { maxZoom: 12, attribution: '© Esri · © OpenStreetMap' }).addTo(map);
  });
  const pt = (a) => (a && typeof a.lat === 'number' ? [a.lat, a.lon] : null);
  const from = pt(f.from);
  const to = pt(f.to);
  const dot = (p, color) => L.circleMarker(p, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map);
  if (from) dot(from, '#5b6b84');
  if (to) dot(to, '#18a058');
  if (from && to) L.polyline([from, to], { color: '#1d5fe0', weight: 2, opacity: 0.5, dashArray: '6 8' }).addTo(map);
  const flown = from ? L.polyline([from], { color: '#1d5fe0', weight: 3 }).addTo(map) : null;
  let plane = null;
  let first = true;
  const update = (pos) => {
    if (!pos || typeof pos.lat !== 'number') return;
    const p = [pos.lat, pos.lon];
    const icon = L.divIcon({ className: 'fl-plane' + (pos.est ? ' est' : ''), html: '<div style="transform:rotate(' + (pos.track || 0) + 'deg)">' + PLANE_SVG + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
    if (plane) plane.setLatLng(p).setIcon(icon);
    else plane = L.marker(p, { icon, zIndexOffset: 1000 }).addTo(map);
    if (flown) flown.setLatLngs([from, p]);
    if (first) {
      first = false;
      map.fitBounds(L.latLngBounds([p, from, to].filter(Boolean)), { padding: [28, 28], maxZoom: 9 });
    }
  };
  if (from || to) map.fitBounds(L.latLngBounds([from, to].filter(Boolean)), { padding: [28, 28], maxZoom: 9 });
  update(f.pos);
  setTimeout(() => { if (!removed) map.invalidateSize(); }, 250);
  return {
    update: (pos) => { if (!removed) update(pos); },
    remove: () => { removed = true; map.remove(); },
  };
}

function posLine(pos, f) {
  if (!pos) return 'Buscando el avión…';
  if (pos.est) {
    const t = f ? arrivalTime(f) : null;
    return '🕒 Posición ESTIMADA por horario' + (t ? ' (llega a las ' + hhmm(t) + ')' : '') +
      ': de este vuelo no llega señal en directo. Para verlo exacto, toca «Ver en Flightradar24».';
  }
  const parts = [];
  if (pos.ground) parts.push('En tierra');
  else if (pos.ft) parts.push('A ' + Math.round(pos.ft * 0.3048).toLocaleString('es-ES') + ' m');
  if (pos.kmh) parts.push(pos.kmh + ' km/h');
  if (pos.at) {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(pos.at)) / 1000));
    parts.push(s < 90 ? 'posición de hace ' + s + ' s' : 'posición de hace ' + Math.round(s / 60) + ' min');
  }
  return '✈️ ' + parts.join(' · ') + ' · se mueve cada 30 s';
}

/** Punto del arco entre dos aeropuertos (fracción t) y rumbo en ese punto. */
function routePoint(a, b, t) {
  const r = (x) => (x * Math.PI) / 180;
  const g = (x) => (x * 180) / Math.PI;
  const [p1, l1, p2, l2] = [r(a.lat), r(a.lon), r(b.lat), r(b.lon)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (!d) return { lat: a.lat, lon: a.lon, track: 0 };
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);
  const track = (g(Math.atan2(Math.sin(l2 - lon) * Math.cos(p2), Math.cos(lat) * Math.sin(p2) - Math.sin(lat) * Math.cos(p2) * Math.cos(l2 - lon))) + 360) % 360;
  return { lat: g(lat), lon: g(lon), track };
}

/** Posición aproximada según el horario, cuando no hay datos del avión en directo. */
function estimatedPos(f) {
  const t = flightProgress(f);
  if (t === null || !f.from || !f.to || typeof f.from.lat !== 'number' || typeof f.to.lat !== 'number') return null;
  return { ...routePoint(f.from, f.to, t), est: true };
}

async function fetchPosition(hex) {
  const res = await fetch(api('/pos?hex=' + encodeURIComponent(hex)));
  if (!res.ok) return null;
  const p = await res.json();
  return p && p.found ? p : null;
}

// ---------- panel del vuelo ----------

async function fetchRoute(code) {
  const res = await fetch(ROUTE_API + encodeURIComponent(code));
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.response && data.response.flightroute ? data.response.flightroute : null;
}

const flightradarUrl = (code) => 'https://www.flightradar24.com/data/flights/' + encodeURIComponent(code.toLowerCase());

/** Abre el panel del vuelo `code` del servicio del día `date` ("AAAA-MM-DD") a la hora `time` ("HH:MM"). */
export function openFlight(code, extra = '', date = '', time = '') {
  const flight = normalizeFlight(code);
  const timers = [];
  let map = null;
  let mapBusy = false;
  let hex = '';
  const sheet = bottomSheet(
    '<h3>✈️ Vuelo ' + esc(flight) + '</h3>' +
    (extra ? '<div class="mut">' + extra + '</div>' : '') +
    '<div id="flroute" class="mt8">Buscando el vuelo…</div>' +
    '<div id="flmapw" hidden><div id="flmap" class="flmap2"></div><div id="flpos" class="mut mt8"></div></div>' +
    '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + flightradarUrl(flight) + '">Ver en Flightradar24</a>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
    { onClose: () => { timers.forEach(clearInterval); if (map) map.remove(); } },
  );
  const info = sheet.querySelector('#flroute');
  const mapWrap = sheet.querySelector('#flmapw');
  const posInfo = sheet.querySelector('#flpos');

  const movePlane = async () => {
    if (!hex || !map || !sheet.isConnected) return;
    try {
      const p = await fetchPosition(hex);
      if (p && sheet.isConnected) {
        map.update(p);
        posInfo.textContent = posLine(p);
      }
    } catch {
      /* se intentará en 30 s */
    }
  };

  let last = null; // último estado del vuelo
  const showMap = async (f) => {
    last = f;
    if (!isAirborne(f)) {
      mapWrap.hidden = true;
      return;
    }
    mapWrap.hidden = false;
    const newHex = !hex && f.hex;
    hex = f.hex || hex;
    // El intermediario ha localizado el avión con el mapa ya abierto: pasar a la posición real.
    if (map && newHex) {
      movePlane();
      timers.push(setInterval(movePlane, POS_MS));
    }
    if (!map && !mapBusy) {
      mapBusy = true;
      map = await flightMap(sheet.querySelector('#flmap'), f);
      mapBusy = false;
      if (map && !sheet.isConnected) { map.remove(); map = null; return; } // se cerró mientras cargaba
      if (!map) { mapWrap.hidden = true; return; }
      posInfo.textContent = posLine(f.pos);
      if (hex) {
        movePlane();
        timers.push(setInterval(movePlane, POS_MS));
      } else {
        // Sin código del avión: la posición de AeroDataBox si la hay; si no, la aproximada por horario.
        const tick = () => {
          if (!map || !sheet.isConnected || hex) return;
          const p = last.pos || estimatedPos(last);
          if (p) { map.update(p); posInfo.textContent = posLine(p, last); }
        };
        tick();
        timers.push(setInterval(tick, POS_MS));
      }
    }
  };

  if (FLIGHT_API && date) {
    const saved = cachedStatus(flight, date);
    if (saved) {
      info.innerHTML = liveHtml(saved, false);
      showMap(saved);
    }
    const load = () =>
      trackedStatus(flight, date, time)
        .then(({ f, live }) => {
          if (!sheet.isConnected) return;
          if (!f) {
            const first = serviceTime({ f: date, h: time }) - 12 * 36e5;
            info.innerHTML = '<div class="fl-wait">🕒 Los datos del vuelo (origen y hora prevista de llegada) aparecerán aquí el ' +
              new Date(first).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' a partir de las ' + hhmm(first) + '.</div>';
            return;
          }
          info.innerHTML = liveHtml(f, live);
          if (f && f.found) showMap(f);
        })
        .catch(() => { if (sheet.isConnected && !saved) info.innerHTML = '<span class="mut">No se pudo consultar el vuelo ahora. Inténtalo en un momento.</span>'; });
    load();
    timers.push(setInterval(load, 6e4)); // solo consulta de verdad cuando toca (y como mucho cada 4 min)
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
 * (retraso, adelanto o cancelación) desde la última consulta. Solo consulta los
 * que lo necesitan: sin horario todavía, o ya en hora de despegue y sin aterrizar.
 */
export async function checkFlights(services) {
  if (!FLIGHT_API) return [];
  const notices = [];
  for (const s of services) {
    const code = normalizeFlight(s.vu);
    if (!code) continue;
    try {
      const { f, prev, live } = await trackedStatus(code, s.f, s.h);
      if (!live || !f || !f.found) continue;
      const n = changeNotice(prev, f, code);
      if (n) notices.push({ ...n, service: s, flight: f });
    } catch {
      /* sin conexión: se intentará en la siguiente revisión */
    }
  }
  return notices;
}
