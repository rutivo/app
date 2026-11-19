// Interpretación del estado de un vuelo (respuesta del intermediario). Funciones puras.

const STATUS = {
  Unknown: 'Sin datos', Expected: 'Programado', CheckIn: 'Facturando', Boarding: 'Embarcando', GateClosed: 'Puerta cerrada',
  Departed: 'Ha despegado', EnRoute: 'En vuelo', Approaching: 'Aproximándose', Delayed: 'Retrasado', Arrived: 'Ha llegado',
  Landed: 'Ha aterrizado', Canceled: 'Cancelado', CanceledUncertain: 'Posiblemente cancelado', Diverted: 'Desviado',
};

export const statusLabel = (s) => STATUS[s] || s || 'Sin datos';
export const isCanceled = (f) => /^Cancel|Diverted/.test(f.status || '');
export const hasLanded = (f) => f.status === 'Arrived' || f.status === 'Landed' || !!(f.arr && f.arr.runway);

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
