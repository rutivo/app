// Interpretación del estado de un vuelo (respuesta del intermediario). Funciones puras.

const STATUS = {
  Unknown: 'Sin datos', Expected: 'Programado', CheckIn: 'Facturando', Boarding: 'Embarcando', GateClosed: 'Puerta cerrada',
  Departed: 'Ha despegado', EnRoute: 'En vuelo', Approaching: 'Aproximándose', Delayed: 'Retrasado', Arrived: 'Ha llegado',
  Landed: 'Ha aterrizado', Canceled: 'Cancelado', CanceledUncertain: 'Posiblemente cancelado', Diverted: 'Desviado',
};

export const statusLabel = (s) => STATUS[s] || s || 'Sin datos';
export const isCanceled = (f) => /^Cancel|Diverted/.test(f.status || '');
export const hasLanded = (f) => f.status === 'Arrived' || f.status === 'Landed' || !!(f.arr && f.arr.runway);

/**
 * Sin confirmación de aterrizaje, pero ya pasaron 10 min de la llegada estimada:
 * se da por aterrizado (los datos gratuitos a veces no lo registran).
 */
export function probablyLanded(f, now = Date.now()) {
  if (!f || f.found === false || isCanceled(f) || hasLanded(f)) return false;
  const eta = arrivalTime(f);
  return eta !== null && now > eta + 10 * 6e4;
}

/** Hora de llegada más fiable que haya: real > revisada > prevista > programada. */
export function arrivalTime(f) {
  const a = f && f.arr;
  if (!a) return null;
  const t = a.runway || a.revised || a.predicted || a.sched;
  return t ? Date.parse(t) : null;
}

/** Minutos de retraso de la llegada (negativo = adelantado), o null. */
export function arrivalDelay(f) {
  const a = f && f.arr;
  if (!a || !a.sched) return null;
  const t = arrivalTime(f);
  return t === null ? null : Math.round((t - Date.parse(a.sched)) / 6e4);
}

/** "15:40" en la hora del móvil. */
export const hhmm = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** "+25 min", "-5 min" o "puntual". */
export function delayLabel(min) {
  if (min === null) return '';
  if (Math.abs(min) < 5) return 'puntual';
  return (min > 0 ? '+' : '') + min + ' min';
}

/**
 * Mensaje de aviso si el vuelo ha cambiado de forma importante desde la última
 * consulta (retraso de 10 min o más, adelanto, cancelación, desvío). null si no.
 */
export function changeNotice(prev, cur, number) {
  if (!cur || !cur.found) return null;
  if (isCanceled(cur) && (!prev || !isCanceled(prev))) {
    return { kind: 'cancel', text: '❌ El vuelo ' + number + ' figura como ' + statusLabel(cur.status).toLowerCase() + '.' };
  }
  if (!prev || !prev.found) return null;
  const before = arrivalTime(prev);
  const now = arrivalTime(cur);
  if (before === null || now === null) return null;
  const diff = Math.round((now - before) / 6e4);
  if (Math.abs(diff) < 10) return null;
  const total = arrivalDelay(cur);
  return diff > 0
    ? { kind: 'delay', text: '⚠️ El vuelo ' + number + ' se ha retrasado ' + diff + ' min. Llega a las ' + hhmm(now) + (total ? ' (' + delayLabel(total) + ' sobre su hora)' : '') + '.' }
    : { kind: 'early', text: '⏩ El vuelo ' + number + ' se ha adelantado ' + -diff + ' min. Llega a las ' + hhmm(now) + '.' };
}

/** Hora de despegue más fiable que haya (real > revisada > prevista > programada), o null. */
export function departureTime(f) {
  const d = f && f.dep;
  if (!d) return null;
  const t = d.runway || d.revised || d.predicted || d.sched;
  return t ? Date.parse(t) : null;
}

/** El avión está en el aire. */
/**
 * Despegue estimado: el real, revisado o previsto; si no hay ninguno, la
 * llegada estimada menos la duración programada (así cuenta el retraso).
 */
export function estDeparture(f) {
  const d = f && f.dep;
  if (!d) return null;
  const known = d.runway || d.revised || d.predicted;
  if (known) return Date.parse(known);
  if (!d.sched) return null;
  const s = Date.parse(d.sched);
  const a = f.arr && f.arr.sched ? Date.parse(f.arr.sched) : null;
  const eta = arrivalTime(f);
  return a !== null && eta !== null && eta - a >= 10 * 6e4 ? s + (eta - a) : s; // retrasos pequeños: sale a su hora
}

/** El avión está en el aire (por su estado, su posición o, si no hay datos en vivo, por su horario). */
export function isAirborne(f, now = Date.now()) {
  if (!f || f.found === false || isCanceled(f) || hasLanded(f)) return false;
  if (/^(Departed|EnRoute|Approaching)$/.test(f.status || '') || (f.dep && f.dep.runway) || f.pos) return true;
  const dep = estDeparture(f);
  const eta = arrivalTime(f);
  return dep !== null && eta !== null && now >= dep + 5 * 6e4 && now < eta;
}

/** Parte del vuelo hecha según el horario (0 a 1), o null. */
export function flightProgress(f, now = Date.now()) {
  const dep = estDeparture(f);
  const eta = arrivalTime(f);
  if (dep === null || eta === null || eta <= dep) return null;
  return Math.min(1, Math.max(0, (now - dep) / (eta - dep)));
}

/**
 * ¿Merece la pena consultar el vuelo ahora? Para no gastar consultas:
 * - sin datos todavía → una vez, 12 h antes del servicio (para saber la hora prevista);
 * - aterrizado o cancelado → no; sin encontrar → otra vez pasadas 6 h;
 * - antes de la hora de despegue → no; desde esa hora, sí, pero espaciado:
 *   en el aire cada 15 min (5 en la última media hora), en tierra cada 10.
 */
export function shouldTrack(f, now, serviceMs = null) {
  if (!f) return serviceMs === null || now >= serviceMs - 12 * 36e5; // primera consulta: 12 h antes del servicio
  if (f.found === false) return !!f.at && now - f.at > 6 * 36e5; // no encontrado: reintentar cada 6 h
  if (isCanceled(f) || hasLanded(f)) return false;
  const eta0 = arrivalTime(f);
  if (eta0 !== null && now > eta0 + 45 * 6e4) return false; // ya debería estar en tierra hace rato
  const t = estDeparture(f);
  if (t !== null && now < t) return false;
  // Ya en hora: en el aire cada 15 min (cada 5 en la última media hora); en tierra con retraso, cada 10.
  const eta = arrivalTime(f);
  const gap = isAirborne(f) ? (eta !== null && eta - now < 30 * 6e4 ? 5 : 15) : 10;
  return !f.at || now - f.at >= gap * 6e4 - 5000;
}
