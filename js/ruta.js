// Rutas en coche sin clave: dirección → coordenadas (Nominatim, OpenStreetMap)
// y tiempo/distancia (OSRM). Con caché en el móvil para no repetir consultas.
import { readFlag, writeFlag } from './dom.js';

const GEO = 'https://nominatim.openstreetmap.org/search';
const ROUTE = 'https://router.project-osrm.org/route/v1/driving/';
const GEO_KEY = 'geoCache';
const POS_KEY = 'ultimaPos';

/** Aeropuerto de Málaga (llegadas). Si el texto es el aeropuerto, no hace falta buscarlo. */
export const AGP = { lat: 36.6749, lon: -4.4991, name: 'Aeropuerto de Málaga' };
export const AIRPORT_RE = /aeropuerto|airport|\bagp\b|aerop\b|terminal t?[123]\b|llegadas/i;

const readJson = (k) => {
  try {
    return JSON.parse(readFlag(k) || '{}');
  } catch {
    return {};
  }
};

/** Coordenadas de una dirección (prioriza la provincia de Málaga). null si no se encuentra. */
export async function geocode(place) {
  const q = String(place || '').trim();
  if (!q) return null;
  if (AIRPORT_RE.test(q) && !/sevilla|granada|almer|jerez|gibraltar/i.test(q)) return AGP;
  const key = q.toLowerCase();
  const cache = readJson(GEO_KEY);
  if (cache[key]) return cache[key];
  const url = GEO + '?format=jsonv2&limit=1&countrycodes=es&accept-language=es&viewbox=-5.6,37.3,-3.7,36.2&q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('geo ' + r.status);
  const [hit] = await r.json();
  if (!hit) return null;
  const out = { lat: +hit.lat, lon: +hit.lon, name: String(hit.display_name || q).split(',').slice(0, 2).join(',') };
  const keys = Object.keys(cache);
  if (keys.length > 150) delete cache[keys[0]];
  cache[key] = out;
  writeFlag(GEO_KEY, JSON.stringify(cache));
  return out;
}

/** Ruta en coche entre dos puntos: {km, min} (sin tráfico). */
export async function route(a, b) {
  const url = ROUTE + a.lon.toFixed(5) + ',' + a.lat.toFixed(5) + ';' + b.lon.toFixed(5) + ',' + b.lat.toFixed(5) + '?overview=false';
  const r = await fetch(url);
  if (!r.ok) throw new Error('ruta ' + r.status);
  const d = await r.json();
  const x = d.routes && d.routes[0];
  if (!x) return null;
  return { km: Math.round(x.distance / 100) / 10, min: Math.round(x.duration / 60) };
}

/**
 * Cuánto más se tarda por el tráfico según la hora (días laborables en la
 * Costa del Sol: mañana, mediodía y tarde). Sin datos de tráfico en directo.
 */
export function trafficFactor(date) {
  const d = new Date(date);
  const h = d.getHours() + d.getMinutes() / 60;
  const weekday = d.getDay() >= 1 && d.getDay() <= 5;
  const summer = d.getMonth() >= 5 && d.getMonth() <= 8;
  let f = 1.1;
  if (h < 6 || h >= 22) f = 1.0;
  else if (weekday && ((h >= 7.5 && h < 9.5) || (h >= 17.5 && h < 20))) f = 1.35;
  else if (weekday && h >= 13.5 && h < 15.5) f = 1.25;
  return summer && f > 1 ? f + 0.1 : f;
}

/**
 * Dónde estás (GPS). Guarda la última posición; si no hay permiso, la última conocida o null.
 * Solo pregunta el permiso si `ask` (al activar «Sal ya»); si no, únicamente si ya estaba dado.
 */
export async function currentPosition(ask = false, maxAgeMin = 10) {
  if (!navigator.geolocation) return lastPosition();
  if (!ask) {
    try {
      const st = await navigator.permissions.query({ name: 'geolocation' });
      if (st.state !== 'granted') return lastPosition();
    } catch {
      return lastPosition();
    }
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() };
        writeFlag(POS_KEY, JSON.stringify(pos));
        resolve(pos);
      },
      () => resolve(lastPosition()),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: maxAgeMin * 6e4 },
    );
  });
}

/** Última posición conocida (de las últimas 6 h), o null. */
export function lastPosition() {
  const p = readJson(POS_KEY);
  return p.lat && Date.now() - p.at < 6 * 36e5 ? p : null;
}
