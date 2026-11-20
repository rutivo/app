// «Sal ya»: a qué hora tienes que salir hacia cada recogida.
// Cuenta la hora real de aterrizaje (con retraso), el tiempo de camino desde
// donde estás con el tráfico típico de esa hora y un margen para aparcar.
import { arrivalDelay, arrivalTime } from './flightStatus.js';
import { AIRPORT_RE, currentPosition, geocode, lastPosition, route, trafficFactor } from './ruta.js';

export { currentPosition };
import { serviceTime } from './trips.js';

/** Ajustes (en Cuenta) con sus valores por defecto. */
export function leaveSettings(cfg = {}) {
  return {
    afterLanding: cfg.salAt == null ? 10 : +cfg.salAt, // estar en llegadas X min después de aterrizar
    early: cfg.salAnt == null ? 5 : +cfg.salAnt, // en otras recogidas, llegar X min antes
    buffer: cfg.salCol == null ? 5 : +cfg.salCol, // colchón
    fallback: cfg.salDef == null ? 25 : +cfg.salDef, // camino si no sé dónde estás
  };
}

export const isAirportPickup = (s) => !!(s && s.vu && AIRPORT_RE.test(s.o || ''));

/**
 * Plan de salida (función pura).
 * `flight`: estado del vuelo (o null). `drive`: {min, km} de camino sin tráfico (o null).
 */
export function leavePlan(s, flight, drive, cfg = {}, now = Date.now()) {
  const st = leaveSettings(cfg);
  const airport = isAirportPickup(s);
  const arr = airport ? arrivalTime(flight) : null;
  const landing = arr || (airport ? serviceTime(s) : null);
  const target = airport ? landing + st.afterLanding * 6e4 : serviceTime(s) - st.early * 6e4;
  let travel;
  let guess = !drive;
  if (drive) {
    const factor = trafficFactor(target - drive.min * 6e4);
    travel = Math.round(drive.min * factor) + (airport ? 7 : 2); // aparcar y llegar a la puerta
  } else travel = st.fallback;
  const leave = target - (travel + st.buffer) * 6e4;
  return {
    id: s.id,
    leave,
    target,
    travel,
    km: drive ? drive.km : null,
    guess,
    airport,
    landing,
    delay: arr ? arrivalDelay(flight) : null,
    // minutos desde el aterrizaje (para el servidor). Sin datos del vuelo aún, cuenta la hora del servicio como aterrizaje previsto
    off: airport ? Math.round((leave - landing) / 6e4) : null,
    late: leave < now,
  };
}

const hhmm = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** "🚗 Sal a las 14:20 (en 35 min)" o "🚗 ¡Sal ya!". */
export function leaveLine(p, now = Date.now()) {
  if (!p) return '';
  const min = Math.round((p.leave - now) / 6e4);
  if (min <= 0) return min > -30 ? '🚗 ¡Sal ya! (' + p.travel + ' min de camino)' : '';
  const inTxt = min < 60 ? min + ' min' : Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
  return '🚗 Sal a las ' + hhmm(p.leave) + ' (en ' + inTxt + ')' + (p.guess ? '' : ' · ' + p.travel + ' min de camino');
}

/** Texto de la notificación de salida. */
export function leaveBody(s, p) {
  const parts = [];
  if (p.airport && p.landing) parts.push((s.vu ? s.vu + ' aterriza ' : 'Aterriza ') + hhmm(p.landing) + (p.delay >= 5 ? ' (+' + p.delay + ' min)' : ''));
  else parts.push('Recogida ' + (s.h || ''));
  parts.push((s.pa ? s.pa + ' · ' : '') + (s.o || ''));
  parts.push(p.travel + ' min de camino');
  return parts.join(' · ');
}

const drives = new Map(); // id del servicio → {at, from, drive}

/** Calcula (con caché) el camino desde donde estás hasta la recogida. */
async function driveTo(s) {
  const pos = (await currentPosition()) || lastPosition();
  if (!pos) return null;
  const key = s.id + '|' + s.o;
  const hit = drives.get(key);
  // se repite si te has movido más de ~2 km o han pasado 20 min
  if (hit && Date.now() - hit.at < 20 * 6e4 && Math.abs(hit.from.lat - pos.lat) + Math.abs(hit.from.lon - pos.lon) < 0.02) return hit.drive;
  const to = await geocode(s.o);
  if (!to) return null;
  const drive = await route(pos, to);
  drives.set(key, { at: Date.now(), from: pos, drive });
  return drive;
}

/** Plan de salida de un servicio con todo lo que se sepa (sin red: el de por defecto). */
export async function planFor(s, flight, cfg) {
  let drive = null;
  try {
    drive = await driveTo(s);
  } catch {
    /* sin red o sin permiso: tiempo de camino por defecto */
  }
  return leavePlan(s, flight, drive, cfg);
}
