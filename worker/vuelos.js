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

import { validSubscription } from './push.js';

const ALLOWED_ORIGINS = ['https://rutivo.github.io'];
const CACHE_SECONDS = 300;
const POS_SECONDS = 30;
const ADSB = ['https://api.adsb.lol/v2/hex/', 'https://api.airplanes.live/v2/hex/'];
const ADB = 'https://aerodatabox.p.rapidapi.com';

const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'cross-origin' };
const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...SECURITY, ...headers, 'content-type': 'application/json; charset=utf-8' } });

// Límite por persona (IP) y hora de consultas que salen fuera de la caché.
const LIMITS = { flight: 40, pos: 400, avisos: 120 };
/** true si esta IP aún puede hacer otra consulta de tipo `kind` esta hora. */
async function allowed(cache, request, kind, ctx) {
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const key = new Request('https://rl.rutivo/' + kind + '/' + encodeURIComponent(ip) + '/' + Math.floor(Date.now() / 36e5));
  const got = await cache.match(key);
  const n = got ? +(await got.text()) || 0 : 0;
  if (n >= LIMITS[kind]) return false;
  ctx.waitUntil(cache.put(key, new Response(String(n + 1), { headers: { 'cache-control': 'max-age=3600' } })));
  return true;
}

/** Solo fechas cercanas (de 2 días antes a 3 días después de hoy). */
function nearDate(d) {
  const t = Date.parse(d + 'T12:00:00Z');
  return Number.isFinite(t) && Math.abs(t - Date.now()) <= 3.5 * 864e5;
}

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
    airlineIcao: f.airline && f.airline.icao ? f.airline.icao : '',
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
async function position(hex) {
  for (const base of ADSB) {
    try {
      const r = await fetch(base + hex, { headers: { 'User-Agent': 'rutivo-vuelos/1.0', Accept: 'application/json' } });
      if (!r.ok) continue;
      const d = await r.json();
      const a = (d.ac || []).find((x) => typeof x.lat === 'number');
      if (!a) return { found: false };
      return { found: true, lat: a.lat, lon: a.lon, track: a.track ?? null, kmh: a.gs ? Math.round(a.gs * 1.852) : null,
        ft: typeof a.alt_baro === 'number' ? a.alt_baro : null, ground: a.alt_baro === 'ground', at: new Date((d.now || Date.now()) - (a.seen_pos || 0) * 1000).toISOString() };
    } catch {
      /* probar la siguiente red */
    }
  }
  return null;
}


// ---------- avión sin código: localizarlo al despegar ----------

const rad = (x) => (x * Math.PI) / 180;
const distKm = (a, b) => 12742 * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2));
const bearing = (a, b) => (Math.atan2(Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat)), Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))) * 180) / Math.PI;
const angle = (x, y) => Math.abs(((x - y + 540) % 360) - 180);

/** Despegue estimado (igual que la app): real/revisado/previsto, o el programado más el retraso de la llegada. */
function estDeparture(f) {
  const d = f.dep || {};
  const known = d.runway || d.revised || d.predicted;
  if (known) return Date.parse(known);
  if (!d.sched) return null;
  const s = Date.parse(d.sched);
  const a = f.arr && f.arr.sched ? Date.parse(f.arr.sched) : null;
  const t = f.arr ? f.arr.runway || f.arr.revised || f.arr.predicted || f.arr.sched : null;
  const eta = t ? Date.parse(t) : null;
  return a !== null && eta !== null && eta - a >= 10 * 6e4 ? s + (eta - a) : s;
}

/**
 * Si AeroDataBox no da el código del avión, se busca en el radar justo después
 * del despegue: el avión de esa aerolínea que sale de ese aeropuerto hacia el
 * destino. Solo se acepta si hay uno (nunca un avión dudoso). Se guarda 8 h.
 */
export async function captureHex(cache, f, n, day, now = Date.now()) {
  const key = new Request('https://cache.rutivo/hex/' + n + '/' + day);
  const got = await cache.match(key);
  if (got) return (await got.json()).hex || '';
  const o = f.from;
  const t = f.to;
  if (!f.airlineIcao || !o || !t || typeof o.lat !== 'number' || typeof t.lat !== 'number') return '';
  const dep = estDeparture(f);
  if (!dep || now < dep - 10 * 6e4 || now > dep + 50 * 6e4) return '';
  const r = await fetch('https://api.adsb.lol/v2/point/' + o.lat.toFixed(3) + '/' + o.lon.toFixed(3) + '/150', { headers: { 'User-Agent': 'rutivo-vuelos/1.0', Accept: 'application/json' } });
  if (!r.ok) return '';
  const d = await r.json();
  const course = bearing(o, t);
  const maxKm = Math.max(40, ((now - dep) / 6e4 + 15) * 14); // lo que puede haber volado desde el despegue
  const found = (d.ac || []).filter((a) => {
    if (typeof a.lat !== 'number' || a.alt_baro === 'ground' || !(a.flight || '').trim().startsWith(f.airlineIcao)) return false;
    const p = { lat: a.lat, lon: a.lon };
    const km = distKm(o, p);
    if (km > maxKm) return false;
    if (km < 25) return typeof a.alt_baro === 'number' && a.alt_baro < 12000; // recién despegado
    return angle(bearing(o, p), course) < 30 && (a.track == null || angle(a.track, bearing(p, t)) < 35);
  });
  if (found.length !== 1) return '';
  const hex = found[0].hex;
  await cache.put(key, new Response(JSON.stringify({ hex }), { headers: { 'cache-control': 'max-age=28800' } }));
  return hex;
}

/**
 * Vuelo resumido (con caché de 5 min). Lo usan la app y los avisos.
 * `fresh`: no mirar la caché (la ruta /flight ya la ha mirado).
 */
export async function flightFor(env, n, d, fresh = false) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.rutivo/flight/' + n + '/' + d);
  if (!fresh) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
  }
  const res = await fetch(ADB + '/flights/number/' + n + '/' + d + '?withAircraftImage=false&withLocation=true', {
    headers: { 'X-RapidAPI-Key': String(env.RAPIDAPI_KEY || '').trim(), 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
  });
  let body;
  if (res.status === 204 || res.status === 404) body = { found: false };
  else if (!res.ok) return null;
  else body = simplify(await res.json(), d);
  if (body.found && !body.hex) {
    try {
      body.hex = await captureHex(cache, body, n, d);
    } catch {
      /* sin código: la app enseña la posición aproximada */
    }
  }
  await cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'cache-control': 'max-age=' + CACHE_SECONDS } }));
  return body;
}

export { Avisos } from './avisos.js';

/** Huella del móvil (de su dirección de avisos): cada uno tiene su despertador. */
async function deviceId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...SECURITY, ...cors } });
    // Solo la app de Rutivo (otras webs no pueden gastar las consultas desde el navegador).
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden' }, 403, cors);
    const url = new URL(request.url);
    const cache = caches.default;

    if (url.pathname === '/avisos') {
      if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
      if (!env.AVISOS || !env.VAPID_PRIVATE) return json({ error: 'off' }, 503, cors);
      const text = await request.text();
      if (text.length > 20000) return json({ error: 'too_big' }, 413, cors);
      let data;
      try { data = JSON.parse(text); } catch { return json({ error: 'bad_request' }, 400, cors); }
      if (!validSubscription(data.sub || {})) return json({ error: 'bad_subscription' }, 400, cors);
      if (!(await allowed(cache, request, 'avisos', ctx))) return json({ error: 'too_many' }, 429, cors);
      const sub = { endpoint: data.sub.endpoint, keys: { p256dh: data.sub.keys.p256dh, auth: data.sub.keys.auth } };
      const stub = env.AVISOS.get(env.AVISOS.idFromName(await deviceId(sub.endpoint)));
      const r = await stub.fetch('https://avisos/', { method: 'POST', body: JSON.stringify({ sub, alarms: data.alarms, tz: data.tz, test: !!data.test, off: !!data.off }) });
      return json(await r.json(), 200, cors);
    }
    if (request.method !== 'GET') return json({ error: 'method' }, 405, cors);
    if (url.pathname === '/pos') {
      const hex = (url.searchParams.get('hex') || '').toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) return json({ error: 'bad_request' }, 400, cors);
      const key = new Request('https://cache.rutivo/pos/' + hex);
      const got = await cache.match(key);
      if (got) return json(await got.json(), 200, { ...cors, 'x-cache': 'hit' });
      if (!(await allowed(cache, request, 'pos', ctx))) return json({ error: 'too_many' }, 429, cors);
      const p = await position(hex);
      if (!p) return json({ error: 'upstream' }, 502, cors);
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(p), { headers: { 'cache-control': 'max-age=' + POS_SECONDS } })));
      return json(p, 200, { ...cors, 'x-cache': 'miss' });
    }
    if (url.pathname !== '/flight') return json({ error: 'not_found' }, 404, cors);
    const n = (url.searchParams.get('n') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const d = url.searchParams.get('d') || '';
    if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(n) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !nearDate(d)) return json({ error: 'bad_request' }, 400, cors);

    const cacheKey = new Request('https://cache.rutivo/flight/' + n + '/' + d);
    const hit = await cache.match(cacheKey);
    if (hit) return json(await hit.json(), 200, { ...cors, 'x-cache': 'hit' });
    if (!(await allowed(cache, request, 'flight', ctx))) return json({ error: 'too_many' }, 429, cors);
    const body = await flightFor(env, n, d, true);
    if (!body) return json({ error: 'upstream' }, 502, cors);
    return json(body, 200, { ...cors, 'x-cache': 'miss' });
  },
};
