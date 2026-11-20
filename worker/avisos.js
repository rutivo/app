// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Avisos con la app cerrada: cada móvil tiene su «despertador» (Durable Object)
// con sus avisos pendientes. A la hora de cada uno manda una notificación Web Push.
//
// Los avisos de «Sal ya» llevan el vuelo: 90 y 35 minutos antes, el despertador
// mira el vuelo y, si se ha retrasado o adelantado, mueve la hora de salida y
// avisa del cambio. Así funciona aunque no abras la app.

import { sendPush } from './push.js';
import { flightFor } from './vuelos.js';

const MAX_ALARMS = 40;
const MAX_FLIGHTS = 12; // avisos que siguen un vuelo, por móvil
const CHECKS = [90, 35]; // minutos antes de salir en los que se revisa el vuelo
const MOVE_MIN = 5; // solo se mueve la salida si cambia 5 min o más

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

/** Limpia lo que manda la app (nunca se guarda nada raro ni enorme). */
export function cleanAlarms(list, now = Date.now()) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list.slice(0, MAX_ALARMS)) {
    const at = Number(a && a.at);
    if (!Number.isFinite(at) || at < now - 36e5 || at > now + 3 * 864e5) continue;
    const x = { id: clip(a.id, 60), at, title: clip(a.title, 90), body: clip(a.body, 240), pre: 0, done: {} };
    if (!x.id || !x.title) continue;
    if (Number.isInteger(a.pre) && a.pre > 0 && a.pre <= 60) x.pre = a.pre;
    const fl = a.fl;
    if (fl && out.filter((a) => a.fl).length < MAX_FLIGHTS && /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(fl.n) && /^\d{4}-\d{2}-\d{2}$/.test(fl.d) && Number.isFinite(fl.off) && Math.abs(fl.off) <= 600) {
      x.fl = { n: fl.n, d: fl.d, off: Math.round(fl.off), who: clip(fl.who, 40) };
    }
    out.push(x);
  }
  return out;
}

/** Próximo momento en que hay que hacer algo con este aviso (o null). */
export function nextEvent(a) {
  const t = [];
  if (a.fl) CHECKS.forEach((m, i) => { if (!a.done['c' + i]) t.push(a.at - m * 6e4); });
  if (a.pre && !a.done.p) t.push(a.at - a.pre * 6e4);
  if (!a.done.m) t.push(a.at);
  return t.length ? Math.min(...t) : null;
}

const hhmm = (ms, tz) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Europe/Madrid' });
const arrivalOf = (f) => {
  const a = f && f.arr;
  const t = a && (a.runway || a.revised || a.predicted || a.sched);
  return t ? Date.parse(t) : null;
};

/**
 * Lo que toca hacer ahora con un aviso. `getFlight(n, d)` da el vuelo.
 * Devuelve las notificaciones a mandar; modifica `a` (hora, hechos).
 */
export async function step(a, now, getFlight, tz) {
  const out = [];
  if (a.fl) {
    for (let i = 0; i < CHECKS.length; i++) {
      if (a.done['c' + i] || now < a.at - CHECKS[i] * 6e4) continue;
      a.done['c' + i] = 1;
      let f = null;
      try { f = await getFlight(a.fl.n, a.fl.d); } catch { /* sin datos: se mantiene la hora */ }
      if (!f || !f.found) continue;
      if (/^Cancel|Diverted/.test(f.status || '')) {
        out.push({ title: '❌ Vuelo ' + a.fl.n + ' ' + (/Divert/.test(f.status) ? 'desviado' : 'cancelado'), body: (a.fl.who ? a.fl.who + ' · ' : '') + 'Confirma con la agencia antes de salir.', tag: a.id });
        a.done = { c0: 1, c1: 1, p: 1, m: 1 };
        return out;
      }
      const arr = arrivalOf(f);
      if (!arr) continue;
      const at = arr + a.fl.off * 6e4;
      if (Math.abs(at - a.at) >= MOVE_MIN * 6e4) {
        const later = at > a.at;
        a.at = at;
        if (a.pre && now >= at - a.pre * 6e4) a.done.p = 1; // ya no da tiempo al «sal en X min»
        out.push({
          title: '✈️ ' + a.fl.n + (later ? ' se retrasa' : ' llega antes') + ': aterriza ' + hhmm(arr, tz),
          body: (a.fl.who ? a.fl.who + ' · ' : '') + 'Ahora sal a las ' + hhmm(at, tz) + '. Te aviso.',
          tag: a.id + '-cambio',
        });
      }
    }
  }
  if (a.pre && !a.done.p && now >= a.at - a.pre * 6e4 && now < a.at) {
    a.done.p = 1;
    out.push({ title: '🚗 Sal en ' + Math.max(1, Math.round((a.at - now) / 6e4)) + ' min', body: a.body, tag: a.id });
  }
  if (!a.done.m && now >= a.at) {
    a.done = { ...a.done, p: 1, m: 1 };
    if (now - a.at < 30 * 6e4) out.push({ title: a.title, body: a.body, tag: a.id }); // si llega tardísimo, ya no se manda
  }
  return out;
}

export class Avisos {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async arm(alarms) {
    const times = alarms.map(nextEvent).filter((t) => t !== null);
    if (times.length) await this.state.storage.setAlarm(Math.max(Date.now() + 1000, Math.min(...times)));
    else await this.state.storage.deleteAlarm();
  }

  async fetch(request) {
    const { sub, alarms, tz, test, off } = await request.json();
    if (off) {
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
      return new Response('{"ok":true}');
    }
    const prev = (await this.state.storage.get('alarms')) || [];
    const list = cleanAlarms(alarms);
    // Lo ya avisado o revisado no se repite al volver a mandar la lista
    for (const a of list) {
      const p = prev.find((x) => x.id === a.id);
      if (p && p.fl && a.fl && p.fl.off === a.fl.off) { a.done = p.done; if (p.done.c0 || p.done.c1) a.at = p.at; }
      else if (p && p.at === a.at) a.done = p.done;
    }
    await this.state.storage.put({ sub, alarms: list, tz: clip(tz, 40) || 'Europe/Madrid' });
    await this.arm(list);
    let status = 0;
    if (test) status = await sendPush(sub, { title: '🔔 Avisos de Rutivo activados', body: 'Te llegarán aunque tengas la app cerrada.', tag: 'rutivo-test' }, this.env);
    return new Response(JSON.stringify({ ok: true, alarms: list.length, test: status }));
  }

  async alarm() {
    const { sub, alarms = [], tz } = Object.fromEntries(await this.state.storage.get(['sub', 'alarms', 'tz']));
    if (!sub) return;
    const now = Date.now();
    const getFlight = (n, d) => flightFor(this.env, n, d);
    for (const a of alarms) {
      if (nextEvent(a) === null || nextEvent(a) > now) continue;
      for (const msg of await step(a, now, getFlight, tz)) {
        const st = await sendPush(sub, msg, this.env).catch(() => 0);
        if (st === 404 || st === 410) { await this.state.storage.deleteAll(); return; } // el móvil ya no tiene avisos
      }
    }
    const left = alarms.filter((a) => nextEvent(a) !== null);
    await this.state.storage.put('alarms', left);
    await this.arm(left);
  }
}
