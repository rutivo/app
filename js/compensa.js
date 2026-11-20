// «¿Me compensa este servicio?»: lo que ganas de verdad y por hora. Funciones puras.
import { dayStats } from './jornada.js';
import { r2 } from './utils.js';

/** Ajustes (en la propia ficha) con sus valores por defecto. */
export function costSettings(cfg = {}, gas = []) {
  const withL = gas.filter((g) => g.l > 0 && g.i > 0).slice(-5);
  const lastPrice = withL.length ? r2(withL.reduce((a, g) => a + g.i / g.l, 0) / withL.length) : null;
  return {
    litersPer100: cfg.cpCons == null ? 6.5 : +cfg.cpCons,
    fuelPrice: cfg.cpPrecio != null ? +cfg.cpPrecio : lastPrice || 1.45,
    fuelFromTickets: cfg.cpPrecio == null && !!lastPrice,
    wearPerKm: cfg.cpDesg == null ? 0.06 : +cfg.cpDesg, // neumáticos, aceite, revisiones…
    commission: cfg.cpCom == null ? 0 : +cfg.cpCom, // % que se queda la agencia o la app
    minPerHour: cfg.cpMin == null ? 20 : +cfg.cpMin, // si aún no hay jornadas apuntadas
  };
}

/** Lo que ganas por hora de media (últimos 30 días con jornada apuntada), o null. */
export function averagePerHour(state, day) {
  const jor = (state.jor || []).filter((j) => j.f < day && j.f >= shift(day, -30));
  const vals = jor.map((j) => dayStats(state.mov || [], j.f, j)).filter((x) => x.perH !== null && x.inc > 0);
  return vals.length >= 3 ? r2(vals.reduce((a, x) => a + x.perH, 0) / vals.length) : null;
}
const shift = (d, k) => {
  const x = new Date(d + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + k);
  return x.toISOString().slice(0, 10);
};

/**
 * Cuentas del servicio.
 * `trip`: {price, km, min, toll, waitMin, empty (vuelta en vacío), commission?}
 */
export function worth(trip, st, avgPerHour = null) {
  const back = trip.empty ? 2 : 1;
  const km = r2((trip.km || 0) * back);
  const hours = r2(((trip.min || 0) * back + (trip.waitMin || 0)) / 60);
  const commissionPct = trip.commission == null ? st.commission : +trip.commission;
  const commission = r2((trip.price * commissionPct) / 100);
  const fuel = r2((km * st.litersPer100 * st.fuelPrice) / 100);
  const wear = r2(km * st.wearPerKm);
  const toll = r2((trip.toll || 0) * (trip.empty && trip.tollBack !== false ? 2 : 1));
  const costs = r2(commission + fuel + wear + toll);
  const net = r2(trip.price - costs);
  const perHour = hours > 0 ? r2(net / hours) : null;
  const ref = avgPerHour || st.minPerHour;
  let verdict = 'si';
  if (net <= 0) verdict = 'no';
  else if (perHour !== null && perHour < ref * 0.8) verdict = 'no';
  else if (perHour !== null && perHour < ref) verdict = 'justo';
  // Precio mínimo para llegar a tu media por hora
  const minPrice = hours > 0 ? r2((ref * hours + fuel + wear + toll) / (1 - commissionPct / 100)) : null;
  return { km, hours, commission, fuel, wear, toll, costs, net, perHour, ref, refIsAverage: !!avgPerHour, verdict, minPrice, perKm: km ? r2(net / km) : null };
}
