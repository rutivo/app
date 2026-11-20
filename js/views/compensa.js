// Ficha «¿Me compensa este servicio?»: precio y destino → ganancia real y por hora.
import { averagePerHour, costSettings, worth } from '../compensa.js';
import { bottomSheet } from '../dom.js';
import { AGP, AIRPORT_RE, currentPosition, geocode, lastPosition, route, trafficFactor } from '../ruta.js';
import { S, save } from '../store.js';
import { esc, eur, today } from '../utils.js';

const VERDICT = {
  si: ['✅ Te compensa', 'ok'],
  justo: ['🤔 Justo', 'warn'],
  no: ['❌ No te compensa', 'bad'],
};

const fmtH = (h) => {
  const m = Math.round(h * 60);
  return (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60 ? (m % 60) + ' min' : '');
};

/** Calcula el viaje (km y minutos con tráfico) entre dos sitios. Sin origen: desde el aeropuerto o desde donde estás. */
export async function tripOf(from, to, when = Date.now()) {
  const a = from ? await geocode(from) : (await currentPosition()) || lastPosition() || AGP;
  const b = await geocode(to);
  if (!a || !b) throw new Error(!b ? 'No encuentro «' + to + '»' : 'No encuentro «' + from + '»');
  const r = await route(a, b);
  if (!r) throw new Error('No encuentro ruta');
  return { km: r.km, min: Math.round(r.min * trafficFactor(when)), fromName: a.name || from || 'aquí', toName: b.name || to };
}

/** Respuesta corta para el asistente: «Ganas 31 € netos, 19 € la hora…». */
export async function quickWorth({ price, from = '', to }) {
  const st = costSettings(S.cfg, S.gas);
  const trip = await tripOf(from, to);
  const avg = averagePerHour(S, today());
  const r = worth({ price, km: trip.km, min: trip.min, empty: true, waitMin: AIRPORT_RE.test(from) ? 20 : 0 }, st, avg);
  const v = VERDICT[r.verdict][0].replace(/^\S+ /, '');
  const text = v + ': ganas ' + eur(r.net) + ' netos' + (r.perHour !== null ? ', unos ' + eur(r.perHour) + ' la hora' : '') +
    ' (ida y vuelta, ' + r.km + ' km, ' + fmtH(r.hours) + '). ' +
    (r.refIsAverage ? 'Tu media es ' + eur(r.ref) + '/h.' : 'Tu mínimo es ' + eur(r.ref) + '/h.') +
    (r.verdict !== 'si' && r.minPrice ? ' Pide al menos ' + eur(Math.ceil(r.minPrice)) + '.' : '');
  return { text, result: r, trip };
}

function resultHtml(r, trip) {
  const [label, cls] = VERDICT[r.verdict];
  const row = (k, v) => '<div class="cp-row"><span>' + k + '</span><b>' + v + '</b></div>';
  return '<div class="cp-verdict ' + cls + '">' + label + '</div>' +
    '<div class="cp-big">' + eur(r.net) + ' <small>netos</small>' + (r.perHour !== null ? ' · ' + eur(r.perHour) + '<small>/hora</small>' : '') + '</div>' +
    '<div class="mut">' + esc(trip.fromName) + ' → ' + esc(trip.toName) + ' · ' + r.km + ' km · ' + fmtH(r.hours) + '</div>' +
    '<div class="cp-list mt8">' +
    (r.commission ? row('Comisión', '−' + eur(r.commission)) : '') +
    row('Gasoil', '−' + eur(r.fuel)) +
    row('Desgaste del coche', '−' + eur(r.wear)) +
    (r.toll ? row('Peajes', '−' + eur(r.toll)) : '') +
    row('€ por km', r.perKm !== null ? eur(r.perKm) : '—') +
    '</div>' +
    '<div class="mut mt8">' + (r.refIsAverage ? 'Tu media de los últimos 30 días: <b>' + eur(r.ref) + '/h</b>.' : 'Tu mínimo: <b>' + eur(r.ref) + '/h</b> (con 3 jornadas apuntadas uso tu media real).') + '</div>' +
    (r.verdict !== 'si' && r.minPrice ? '<div class="mt8">💡 Para que te compense, pide al menos <b>' + eur(Math.ceil(r.minPrice)) + '</b>.</div>' : '');
}

/** Abre la ficha. `pre`: {price, from, to, commission}. */
export function openWorth(pre = {}) {
  const st = costSettings(S.cfg, S.gas);
  const num = (id, label, v, step = '0.01') => '<div><label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" type="number" step="' + step + '" min="0" inputmode="decimal" value="' + (v ?? '') + '"></div>';
  const sheet = bottomSheet(
    '<div class="card"><div class="mut">💶 ¿Me compensa este servicio?</div>' +
    '<form id="cpf">' +
    '<div class="row">' + num('cpp', 'Precio (€)', pre.price) + num('cpc', 'Comisión (%)', pre.commission ?? st.commission, '1') + '</div>' +
    '<label class="f" for="cpo">Desde</label><input id="cpo" placeholder="Aeropuerto, hotel… (vacío = donde estás)" value="' + esc(pre.from || '') + '">' +
    '<label class="f" for="cpd">Hasta</label><input id="cpd" required placeholder="Marbella, Hotel Puente Romano…" value="' + esc(pre.to || '') + '">' +
    '<div class="row">' + num('cpt', 'Peaje ida (€)', pre.toll || '') + num('cpw', 'Espera (min)', pre.wait ?? (AIRPORT_RE.test(pre.from || '') ? 20 : 0), '5') + '</div>' +
    '<label class="chk mt8"><input type="checkbox" id="cpv" checked> Vuelvo en vacío (cuenta la vuelta)</label>' +
    '<details class="mt8"><summary>Mi coche</summary>' +
    '<div class="row">' + num('cpl', 'Consumo (L/100 km)', st.litersPer100, '0.1') + num('cpf2', 'Gasoil (€/L)', st.fuelPrice, '0.01') + '</div>' +
    (st.fuelFromTickets ? '<div class="mut">Precio sacado de tus tickets de gasolina.</div>' : '') +
    '<div class="row">' + num('cpdz', 'Desgaste (€/km)', st.wearPerKm) + num('cpm', 'Mínimo €/hora', st.minPerHour, '1') + '</div>' +
    '</details>' +
    '<button class="mt10">Calcular</button></form>' +
    '<div id="cpr" class="mt10" aria-live="polite"></div></div>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const q = (id) => sheet.querySelector('#' + id);
  const keepCar = () => {
    S.cfg.cpCons = +q('cpl').value || 0;
    if (+q('cpf2').value !== st.fuelPrice) S.cfg.cpPrecio = +q('cpf2').value || 0;
    S.cfg.cpDesg = +q('cpdz').value || 0;
    S.cfg.cpMin = +q('cpm').value || 0;
    S.cfg.cpCom = +q('cpc').value || 0;
    save();
  };
  q('cpf').onsubmit = async (e) => {
    e.preventDefault();
    const out = q('cpr');
    const price = +q('cpp').value;
    if (!(price > 0)) { out.innerHTML = '<span class="mut">Pon el precio del servicio.</span>'; return; }
    keepCar();
    out.innerHTML = '<span class="mut">Calculando la ruta…</span>';
    try {
      const trip = await tripOf(q('cpo').value.trim(), q('cpd').value.trim());
      const r = worth({ price, km: trip.km, min: trip.min, toll: +q('cpt').value || 0, waitMin: +q('cpw').value || 0, empty: q('cpv').checked, commission: +q('cpc').value || 0 },
        costSettings(S.cfg, S.gas), averagePerHour(S, today()));
      out.innerHTML = resultHtml(r, trip);
    } catch (err) {
      out.innerHTML = '<span class="mut">' + esc(err.message && err.message.startsWith('No ') ? err.message + '. Escribe el pueblo o la dirección más completa.' : 'Sin conexión para calcular la ruta ahora.') + '</span>';
    }
  };
  if (pre.price && pre.to) q('cpf').requestSubmit();
  return sheet;
}
