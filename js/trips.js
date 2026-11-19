// Servicios: horarios, kilómetros y navegación. Funciones puras.
import { r2 } from './utils.js';

/** Momento del servicio (fecha + hora local) en milisegundos. */
export function serviceTime(s) {
  return new Date(s.f + 'T' + (s.h || '00:00') + ':00').getTime();
}

/** Servicios que empiezan entre ahora y dentro de `hours` horas, por orden. */
export function upcoming(services, nowMs, hours) {
  const limit = nowMs + hours * 36e5;
  return services
    .filter((s) => { const t = serviceTime(s); return t >= nowMs && t <= limit; })
    .sort((a, b) => serviceTime(a) - serviceTime(b));
}

/** Kilómetros recorridos en un servicio, o null si faltan datos. */
export function kmOf(s) {
  const a = Number(s.ki);
  const b = Number(s.kf);
  if (s.ki === undefined || s.ki === '' || s.kf === undefined || s.kf === '' || !(b > a)) return null;
  return r2(b - a);
}

/** Euros generados por kilómetro en un servicio, o null. */
export function perKm(s) {
  const km = kmOf(s);
  return km ? r2(s.i / km) : null;
}

/** Resumen de km y €/km de una lista de servicios (solo los que tienen km). */
export function kmSummary(services) {
  const withKm = services.filter((s) => kmOf(s));
  const km = r2(withKm.reduce((a, s) => a + kmOf(s), 0));
  const money = r2(withKm.reduce((a, s) => a + s.i, 0));
  return { count: withKm.length, km, money, perKm: km ? r2(money / km) : null };
}

/** Enlace de Google Maps con la ruta en coche hasta `place`. */
export const mapsUrl = (place) =>
  'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(place);

/** "Hoy 09:15", "Mañana 18:40" o "Jue 20/11 11:45". */
export function whenLabel(s, nowMs) {
  const d = new Date(serviceTime(s));
  const day = (x) => new Date(x).toDateString();
  const time = s.h || '';
  if (day(d) === day(nowMs)) return 'Hoy ' + time;
  if (day(d) === day(nowMs + 864e5)) return 'Mañana ' + time;
  const wd = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()];
  return wd + ' ' + s.f.slice(8) + '/' + s.f.slice(5, 7) + ' ' + time;
}

/** "en 3 h 20 min" hasta el servicio. */
export function timeUntil(s, nowMs) {
  const min = Math.max(0, Math.round((serviceTime(s) - nowMs) / 6e4));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return 'en ' + (h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min');
}
