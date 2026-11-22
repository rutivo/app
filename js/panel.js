// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel Transfer: cómo se reparten los servicios (el próximo, hoy, mañana, la
// semana y lo que te deben) y sus números. Funciones puras.
import { serviceTime } from './trips.js';
import { r2, sum } from './utils.js';

const DAY = 864e5;
const dayOf = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/** Los servicios ordenados en grupos, a partir de `now`. */
export function panelGroups(services, now = Date.now()) {
  const today = dayOf(now);
  const tomorrow = dayOf(now + DAY);
  const week = dayOf(now + 7 * DAY);
  // Un servicio sigue «en curso» hasta 2 h después de su hora (la recogida puede retrasarse)
  const live = services.filter((s) => serviceTime(s) > now - 2 * 36e5).sort((a, b) => serviceTime(a) - serviceTime(b));
  const next = live[0] || null;
  const rest = live.slice(1);
  const debt = services.filter((s) => s.p === 'pendiente' && serviceTime(s) <= now - 2 * 36e5).sort((a, b) => serviceTime(b) - serviceTime(a));
  const ofToday = services.filter((s) => s.f === today);
  return {
    next,
    today: rest.filter((s) => s.f === today),
    tomorrow: rest.filter((s) => s.f === tomorrow),
    week: rest.filter((s) => s.f > tomorrow && s.f <= week),
    later: rest.filter((s) => s.f > week).length,
    debt,
    kpi: {
      todayCount: ofToday.length,
      todayMoney: r2(sum(ofToday, (s) => s.i || 0)),
      owed: r2(sum(services.filter((s) => s.p === 'pendiente'), (s) => s.i || 0)),
      weekCount: services.filter((s) => s.f >= today && s.f <= week).length,
    },
  };
}

