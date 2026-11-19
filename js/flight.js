// Seguimiento del vuelo dentro de la app.
// - Ruta (aerolínea, origen y destino): api.adsbdb.com (gratis, sin clave).
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

const flightradarUrl = (code) => 'https://www.flightradar24.com/data/flights/' + encodeURIComponent(code.toLowerCase());

/** Abre el panel del vuelo `code` (p. ej. "VY1234"). */
export function openFlight(code, extra = '') {
  const flight = normalizeFlight(code);
  const sheet = bottomSheet(
    '<h3>✈️ Vuelo ' + esc(flight) + '</h3>' +
    (extra ? '<div class="mut">' + extra + '</div>' : '') +
    '<div id="flroute" class="mt8">Buscando el vuelo…</div>' +
    '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + flightradarUrl(flight) + '">Abrir en Flightradar24</a>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const info = sheet.querySelector('#flroute');

  fetchRoute(flight)
    .then((r) => {
      info.innerHTML = r
        ? '<b>' + esc(r.airline ? r.airline.name : '') + '</b><br>' + place(r.origin) + ' → ' + place(r.destination)
        : '<span class="mut">No tengo datos de este vuelo. Ábrelo en Flightradar24 para verlo en directo.</span>';
    })
    .catch(() => {
      info.innerHTML = '<span class="mut">Sin conexión para consultar la ruta.</span>';
    });
  return sheet;
}
