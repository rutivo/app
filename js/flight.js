// Seguimiento del vuelo dentro de la app.
// - Ruta (aerolínea, origen y destino): api.adsbdb.com (gratis, sin clave).
// - Mapa en directo con el avión: globe.adsbexchange.com dentro de la app.
// - Si algo falla, queda el botón para abrirlo en Flightradar24.
import { bottomSheet } from './dom.js';
import { esc } from './utils.js';

const ROUTE_API = 'https://api.adsbdb.com/v0/callsign/';

/** "vy 1234" → "VY1234". */
export const normalizeFlight = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const place = (a) => (a ? esc(a.municipality || a.name) + ' (' + esc(a.iata_code) + ')' : '');

async function fetchRoute(code) {
  const res = await fetch(ROUTE_API + encodeURIComponent(code));
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.response && data.response.flightroute ? data.response.flightroute : null;
}

const liveMapUrl = (callsign) =>
  'https://globe.adsbexchange.com/?callsign=' + encodeURIComponent(callsign) + '&hideSidebar&hideButtons&zoom=6';

const flightradarUrl = (code) => 'https://www.flightradar24.com/data/flights/' + encodeURIComponent(code.toLowerCase());

/** Abre el panel del vuelo `code` (p. ej. "VY1234"). */
export function openFlight(code, extra = '') {
  const flight = normalizeFlight(code);
  const sheet = bottomSheet(
    '<h3>✈️ Vuelo ' + esc(flight) + '</h3>' +
    (extra ? '<div class="mut">' + extra + '</div>' : '') +
    '<div id="flroute" class="mt8">Buscando el vuelo…</div>' +
    '<div class="flmap"><iframe title="Mapa del vuelo en directo" loading="lazy" referrerpolicy="no-referrer"></iframe></div>' +
    '<div class="mut mt8">Si el avión aún no ha despegado o ya ha aterrizado, el mapa puede salir vacío.</div>' +
    '<a class="btn sec" target="_blank" rel="noopener noreferrer" href="' + flightradarUrl(flight) + '">Abrir en Flightradar24</a>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const info = sheet.querySelector('#flroute');
  const frame = sheet.querySelector('iframe');

  fetchRoute(flight)
    .then((r) => {
      const callsign = (r && r.callsign_icao) || flight;
      frame.src = liveMapUrl(callsign);
      info.innerHTML = r
        ? '<b>' + esc(r.airline ? r.airline.name : '') + '</b><br>' + place(r.origin) + ' → ' + place(r.destination)
        : '<span class="mut">No encuentro la ruta de este vuelo. Revisa el número.</span>';
    })
    .catch(() => {
      frame.src = liveMapUrl(flight);
      info.innerHTML = '<span class="mut">Sin conexión para consultar la ruta.</span>';
    });
  return sheet;
}
