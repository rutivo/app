// Intermediario de vuelos de Rutivo (Cloudflare Worker).
//
// La app pide  GET /flight?n=FR4250&d=2026-11-19  y este Worker consulta
// AeroDataBox con la clave guardada como secreto (RAPIDAPI_KEY), resume la
// respuesta y la guarda 5 minutos en caché: si muchos conductores miran el
// mismo vuelo, solo se gasta una consulta.
//
// Con el avión en el aire, la app pide  GET /pos?hex=4ca7b3  para moverlo en
// el mapa: sale de redes ADS-B gratuitas (adsb.lol y, si falla, airplanes.live),
// así que no gasta consultas de AeroDataBox.

const ALLOWED_ORIGINS = ['https://rutivo.github.io', 'http://localhost:8080', 'http://localhost:8702'];
const CACHE_SECONDS = 300;
const POS_SECONDS = 30;
const ADSB = ['https://api.adsb.lol/v2/hex/', 'https://api.airplanes.live/v2/hex/'];
const ADB = 'https://aerodatabox.p.rapidapi.com';

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });

/** "2026-11-19 12:30Z" → "2026-11-19T12:30:00Z" */
const iso = (t) => (t && t.utc ? t.utc.replace(' ', 'T').replace(/Z$/, ':00Z').replace(/:(\d\d):00:00Z$/, ':$1:00Z') : null);

const airport = (a) =>
  a ? { iata: a.iata || '', icao: a.icao || '', name: a.shortName || a.name || '', city: a.municipalityName || '', lat: a.location ? a.location.lat : null, lon: a.location ? a.location.lon : null } : null;

/** Posición que da AeroDataBox con el avión en el aire. */
const location = (l) =>
  l && typeof l.lat === 'number'
    ? { lat: l.lat, lon: l.lon, track: l.trueTrack ? l.trueTrack.deg : null, kmh: l.groundSpeed ? l.groundSpeed.kmPerHour : null,
        ft: l.pressureAltitude ? l.pressureAltitude.feet : null, at: l.reportedAtUtc ? l.reportedAtUtc.replace(' ', 'T') + 'Z' : null }
    : null;

/** De varios tramos con el mismo número, el que llega ese día (o el que está volando). */
function pickLeg(list, day) {
  const arrDay = (f) => (f.arrival && f.arrival.scheduledTime && f.arrival.scheduledTime.local ? f.arrival.scheduledTime.local.slice(0, 10) : '');
  const today = list.filter((f) => arrDay(f) === day);
  const pool = today.length ? today : list;
  return pool.find((f) => /EnRoute|Departed|Approaching/.test(f.status || '')) || pool[0];
}

const times = (m) =>
  m ? { sched: iso(m.scheduledTime), revised: iso(m.revisedTime), predicted: iso(m.predictedTime), runway: iso(m.runwayTime), terminal: m.terminal || '', gate: m.gate || '' } : null;

/** Resume un vuelo de AeroDataBox en lo que usa la app. */
export function simplify(list, day = '') {
  const f = Array.isArray(list) && list.length ? pickLeg(list, day) : null;
  if (!f) return { found: false };
  return {
    found: true,
    number: (f.number || '').replace(/\s/g, ''),
    status: f.status || 'Unknown',
    airline: f.airline ? f.airline.name : '',
    from: airport(f.departure && f.departure.airport),
    to: airport(f.arrival && f.arrival.airport),
    dep: times(f.departure),
    arr: times(f.arrival),
    updated: f.lastUpdatedUtc ? f.lastUpdatedUtc.replace(' ', 'T') : null,
    hex: f.aircraft && f.aircraft.modeS ? f.aircraft.modeS.toLowerCase() : '',
    model: f.aircraft ? f.aircraft.model || '' : '',
    pos: location(f.location),
  };
}

/** Posición en directo por el código del transpondedor (gratis). */
async function position(hex, tried = []) {
  for (const base of ADSB) {
    try {
      const r = await fetch(base + hex, { headers: { 'User-Agent': 'rutivo-vuelos/1.0', Accept: 'application/json' } });
      tried.push(new URL(base).hostname + ' ' + r.status);
      if (!r.ok) continue;
      const d = await r.json();
      const a = (d.ac || []).find((x) => typeof x.lat === 'number');
      if (!a) return { found: false };
      return { found: true, lat: a.lat, lon: a.lon, track: a.track ?? null, kmh: a.gs ? Math.round(a.gs * 1.852) : null,
        ft: typeof a.alt_baro === 'number' ? a.alt_baro : null, ground: a.alt_baro === 'ground', at: new Date((d.now || Date.now()) - (a.seen_pos || 0) * 1000).toISOString() };
    } catch (e) {
      tried.push(new URL(base).hostname + ' ' + e.message); // probar la siguiente red
    }
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const cache = caches.default;
    if (url.pathname === '/pos') {
      const hex = (url.searchParams.get('hex') || '').toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) return json({ error: 'bad_request' }, 400, cors);
      const key = new Request('https://cache.rutivo/pos/' + hex);
      const got = await cache.match(key);
      if (got) return json(await got.json(), 200, { ...cors, 'x-cache': 'hit' });
      const tried = [];
      const p = await position(hex, tried);
      if (!p) return json({ error: 'upstream', tried }, 502, cors);
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(p), { headers: { 'cache-control': 'max-age=' + POS_SECONDS } })));
      return json(p, 200, { ...cors, 'x-cache': 'miss' });
    }
    if (url.pathname !== '/flight') return json({ error: 'not_found' }, 404, cors);
    const n = (url.searchParams.get('n') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const d = url.searchParams.get('d') || '';
    if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(n) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return json({ error: 'bad_request' }, 400, cors);

    const cacheKey = new Request('https://cache.rutivo/flight/' + n + '/' + d);
    const hit = await cache.match(cacheKey);
    if (hit) return json(await hit.json(), 200, { ...cors, 'x-cache': 'hit' });

    const res = await fetch(ADB + '/flights/number/' + n + '/' + d + '?withAircraftImage=false&withLocation=true', {
      headers: { 'X-RapidAPI-Key': String(env.RAPIDAPI_KEY || '').trim(), 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
    });
    let body;
    if (res.status === 204 || res.status === 404) body = { found: false };
    else if (!res.ok) return json({ error: 'upstream', status: res.status }, 502, cors);
    else body = simplify(await res.json(), d);

    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'cache-control': 'max-age=' + CACHE_SECONDS } })));
    return json(body, 200, { ...cors, 'x-cache': 'miss' });
  },
};
