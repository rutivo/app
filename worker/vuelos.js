// Intermediario de vuelos de Rutivo (Cloudflare Worker).
//
// La app pide  GET /flight?n=FR4250&d=2026-11-19  y este Worker consulta
// AeroDataBox con la clave guardada como secreto (RAPIDAPI_KEY), resume la
// respuesta y la guarda 5 minutos en caché: si muchos conductores miran el
// mismo vuelo, solo se gasta una consulta.

const ALLOWED_ORIGINS = ['https://rutivo.github.io', 'http://localhost:8080', 'http://localhost:8702'];
const CACHE_SECONDS = 300;
const ADB = 'https://aerodatabox.p.rapidapi.com';

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });

/** "2026-11-19 12:30Z" → "2026-11-19T12:30:00Z" */
const iso = (t) => (t && t.utc ? t.utc.replace(' ', 'T').replace(/Z$/, ':00Z').replace(/:(\d\d):00:00Z$/, ':$1:00Z') : null);

const airport = (a) => (a ? { iata: a.iata || '', icao: a.icao || '', name: a.shortName || a.name || '', city: a.municipalityName || '' } : null);

const times = (m) =>
  m ? { sched: iso(m.scheduledTime), revised: iso(m.revisedTime), predicted: iso(m.predictedTime), runway: iso(m.runwayTime), terminal: m.terminal || '', gate: m.gate || '' } : null;

/** Resume un vuelo de AeroDataBox en lo que usa la app. */
export function simplify(list) {
  const f = Array.isArray(list) ? list[0] : null;
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
  };
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
    if (url.pathname !== '/flight') return json({ error: 'not_found' }, 404, cors);
    const n = (url.searchParams.get('n') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const d = url.searchParams.get('d') || '';
    if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(n) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return json({ error: 'bad_request' }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request('https://cache.rutivo/flight/' + n + '/' + d);
    const hit = await cache.match(cacheKey);
    if (hit) return json(await hit.json(), 200, { ...cors, 'x-cache': 'hit' });

    const res = await fetch(ADB + '/flights/number/' + n + '/' + d + '?withAircraftImage=false&withLocation=false', {
      headers: { 'X-RapidAPI-Key': String(env.RAPIDAPI_KEY || '').trim(), 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
    });
    let body;
    if (res.status === 204 || res.status === 404) body = { found: false };
    else if (!res.ok) return json({ error: 'upstream', status: res.status }, 502, cors);
    else body = simplify(await res.json());

    ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'cache-control': 'max-age=' + CACHE_SECONDS } })));
    return json(body, 200, { ...cors, 'x-cache': 'miss' });
  },
};
