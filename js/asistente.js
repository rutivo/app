// Asistente de Rutivo: entiende preguntas y órdenes en español sobre tus datos.
// Funciones puras: todo se calcula en el móvil, sin enviar nada fuera.
import { huchaStatus, huchasOf } from './huchas.js';
import { hoursOf } from './jornada.js';
import { quarterData } from './report.js';
import { serviceTime } from './trips.js';
import { MONTHS, eur, fd, quarterOf, r2, sum } from './utils.js';

// ---------- texto ----------

/** Minúsculas, sin tildes y sin signos, con los números escritos pasados a cifras. */
export function normalize(text) {
  let t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s*(?:€|eur\b)/g, '$1 euros')
    .replace(/[¿?¡!.,;:"«»()]/g, (c, i, s) => (c === ',' && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '') ? '.' : ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return wordsToNumbers(t);
}

const UNITS = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };

/** "cuarenta y cinco" → "45", "ciento veinte" → "120", "mil doscientos" → "1200". */
function wordsToNumbers(t) {
  const words = t.split(' ');
  const out = [];
  let acc = null;
  let i = 0;
  const flush = () => { if (acc !== null) { out.push(String(acc)); acc = null; } };
  while (i < words.length) {
    const w = words[i];
    if (w in HUNDREDS) acc = (acc || 0) + HUNDREDS[w];
    else if (w === 'mil') acc = (acc || 1) * 1000;
    else if (w in TENS) acc = (acc || 0) + TENS[w];
    else if (w in UNITS && !(w === 'un' || w === 'una') ) acc = (acc || 0) + UNITS[w];
    else if ((w === 'un' || w === 'una') && acc !== null) acc += 1;
    else if (w === 'y' && acc !== null && words[i + 1] in UNITS) { i++; continue; }
    else { flush(); out.push(w); }
    i++;
  }
  flush();
  return out.join(' ');
}

const has = (t, ...words) => words.some((w) => new RegExp('(^| )' + w + '( |$)').test(t));

/** Euros para leer en voz alta: 45 → "45 euros", 45.5 → "45 con 50". */
export function spoken(n) {
  const v = r2(Math.abs(n || 0));
  const e = Math.floor(v);
  const c = Math.round((v - e) * 100);
  return (n < 0 ? 'menos ' : '') + (c ? e + ' con ' + String(c).padStart(2, '0') : e + (e === 1 ? ' euro' : ' euros'));
}

// ---------- fechas ----------

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const monthRange = (y, m) => ({ from: y + '-' + String(m).padStart(2, '0') + '-01', to: iso(new Date(y, m, 0, 12)) });

/** Periodo del que se habla: {from, to, label}. `def` si no se dice ninguno. */
export function periodOf(t, day, def = 'hoy') {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7);
  const q = Math.ceil(m / 3);
  if (has(t, 'ayer')) { const d = addDays(day, -1); return { from: d, to: d, label: 'ayer' }; }
  if (has(t, 'anteayer')) { const d = addDays(day, -2); return { from: d, to: d, label: 'anteayer' }; }
  if (/semana pasada/.test(t)) { const wd = (new Date(day + 'T12:00:00').getDay() + 6) % 7; const a = addDays(day, -wd - 7); return { from: a, to: addDays(a, 6), label: 'la semana pasada' }; }
  if (/(esta|la) semana/.test(t)) { const wd = (new Date(day + 'T12:00:00').getDay() + 6) % 7; return { from: addDays(day, -wd), to: day, label: 'esta semana' }; }
  if (/mes pasado/.test(t)) { const r = m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1); return { ...r, label: 'el mes pasado' }; }
  if (/trimestre pasado/.test(t)) { const qq = q === 1 ? 4 : q - 1; const yy = q === 1 ? y - 1 : y; return { from: monthRange(yy, qq * 3 - 2).from, to: monthRange(yy, qq * 3).to, label: 'el trimestre pasado', q: yy + '-T' + qq }; }
  if (/trimestre/.test(t)) return { from: monthRange(y, q * 3 - 2).from, to: day, label: 'este trimestre', q: y + '-T' + q };
  if (/ano pasado/.test(t)) return { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31', label: 'el año pasado' };
  if (/(este|el|al|del) ano|en el ano|anual/.test(t)) return { from: y + '-01-01', to: day, label: 'este año' };
  for (let i = 0; i < 12; i++) {
    if (has(t, MONTHS[i].normalize('NFD').replace(/[̀-ͯ]/g, ''))) {
      const yy = i + 1 > m ? y - 1 : y;
      return { ...monthRange(yy, i + 1), label: 'en ' + MONTHS[i] + (yy !== y ? ' de ' + yy : '') };
    }
  }
  if (/(este|el|al|del) mes|mensual/.test(t)) return { ...monthRange(y, m), to: day, label: 'este mes' };
  if (has(t, 'hoy') || def === 'hoy') return { from: day, to: day, label: 'hoy' };
  if (def === 'mes') return { ...monthRange(y, m), to: day, label: 'este mes' };
  if (def === 'ano') return { from: y + '-01-01', to: day, label: 'este año' };
  return { from: '0000-01-01', to: '9999-12-31', label: 'en total' };
}

const inRange = (f, p) => f >= p.from && f <= p.to;

/** El periodo anterior, del mismo tamaño, para comparar. */
function previous(p) {
  if (p.from.startsWith('0000')) return null;
  const days = Math.round((new Date(p.to) - new Date(p.from)) / 864e5) + 1;
  if (p.label === 'este mes' || /^en [a-z]/.test(p.label) || p.label === 'el mes pasado') {
    const d = new Date(p.from + 'T12:00:00'); d.setMonth(d.getMonth() - 1);
    const from = iso(d); const to = addDays(from, Math.round((new Date(p.to) - new Date(p.from)) / 864e5));
    return { from, to };
  }
  return { from: addDays(p.from, -days), to: addDays(p.from, -1) };
}

// ---------- intenciones ----------

const money = (state, p) => {
  const list = state.mov.filter((x) => inRange(x.f, p));
  const inc = r2(sum(list.filter((x) => x.t === 'in'), (x) => x.i));
  const out = r2(sum(list.filter((x) => x.t === 'out'), (x) => x.i));
  return { inc, out, net: r2(inc - out), count: list.filter((x) => x.t === 'in').length };
};

const clean = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Cliente o pasajero nombrado en la frase (por palabras sueltas). */
function findName(t, names) {
  let best = null;
  for (const n of names) {
    const words = clean(n).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !['s.l', 'sl', 'the', 'mrs', 'mr'].includes(w));
    const hits = words.filter((w) => has(t, w)).length;
    if (hits && (!best || hits > best.hits)) best = { name: n, hits };
  }
  return best ? best.name : null;
}

const amountOf = (t) => {
  const m = t.match(/(\d+(?:\.\d{1,2})?)\s*(?:euros?|pavos)?/);
  return m ? +m[1] : null;
};

const reply = (text, speech, extra = {}) => ({ kind: 'answer', text, speech: speech || text.replace(/\*\*/g, ''), ...extra });

/**
 * Responde a lo que dice el usuario. Devuelve
 *  {kind:'answer', text, speech} o
 *  {kind:'action', action:{list, item}, text, speech} (la vista lo guarda y permite deshacer).
 */
export function ask(input, state, now = new Date(), helpers = {}) {
  const t = normalize(input);
  const day = iso(now);
  if (!t) return reply('Dime algo, por ejemplo: «¿Cuánto llevo hoy?»');

  // --- Órdenes: apuntar ---
  const wantsWrite = /^(apunta|anota|añade|anade|pon|mete|registra|suma|guarda)\b/.test(t) || /^(he cobrado|cobre|cobrado|he gastado|gaste|he pagado|pague)\b/.test(t) ||
    /^(un |una )?(gasto|ingreso|carrera|cobro|servicio) (de )?\d/.test(t);
  const amount = amountOf(t);
  if (wantsWrite && amount) {
    const pay = has(t, 'tarjeta', 'datafono', 'visa') ? 'tarjeta' : 'efectivo';
    if (has(t, 'hucha', 'huchas')) {
      const hs = huchasOf(state.cfg);
      const h = hs.find((x) => has(t, clean(x.n).split(' ').pop())) || hs[0];
      return { kind: 'action', action: { list: 'huc', item: { f: day, i: r2(amount), h: h.id } },
        text: '🐷 Metidos **' + eur(amount) + '** en «' + h.n + '».', speech: 'Metidos ' + spoken(amount) + ' en ' + h.n };
    }
    const expense = /gasto|gaste|gastado|pagado|pague|peaje|lavado|parking|taller|comida|aparcamiento/.test(t);
    const fuel = /gasolina|gasoil|diesel|combustible|repost/.test(t);
    const concept = (t.match(/(?:de|por|en|concepto)\s+([a-z ]+)$/) || [])[1];
    const what = fuel ? 'Gasolina' : concept && !/^(efectivo|tarjeta|euros?)$/.test(concept.trim()) ? concept.replace(/\b(en|con)\s+(efectivo|tarjeta)\b/, '').trim() : expense ? 'Gasto' : 'Carrera';
    const c = what.charAt(0).toUpperCase() + what.slice(1);
    return { kind: 'action', action: { list: 'mov', item: { f: day, t: expense || fuel ? 'out' : 'in', p: pay, i: r2(amount), c } },
      text: (expense || fuel ? '🧾 Gasto apuntado: **' : '💶 Apuntado: **') + eur(amount) + '** · ' + pay + ' · ' + c,
      speech: (expense || fuel ? 'Gasto apuntado: ' : 'Apuntado: ') + spoken(amount) + (pay === 'tarjeta' ? ' con tarjeta' : ' en efectivo') };
  }

  // --- Ayuda ---
  if (/ayuda|que (puedo|se puede) (preguntar|decir)|que sabes|como funcionas/.test(t)) {
    return reply('Puedes preguntarme o pedirme cosas como:\n• ¿Cuánto llevo hoy?\n• ¿Cuánto gané el mes pasado?\n• ¿Cuánto me debe Charly?\n• ¿Qué tengo mañana?\n• ¿Cuándo llevé a Richard?\n• ¿Cuánto gasto en gasolina?\n• ¿Cuánto IVA pago este trimestre?\n• ¿Cuántos kilómetros llevo este mes?\n• ¿Cómo va mi hucha?\n• Apunta 45 euros en efectivo\n• Gasto de 6 euros de lavado',
      'Puedes preguntarme cuánto llevas, quién te debe, qué servicios tienes, o pedirme que apunte una carrera o un gasto.');
  }

  // --- Lo que me deben ---
  if (/(me debe|me deben|deben|debe|pendiente|sin cobrar|por cobrar|cobrar)/.test(t)) {
    const pend = state.srv.filter((s) => s.p === 'pendiente' && serviceTime(s) <= now.getTime());
    const who = findName(t, [...new Set(state.srv.map((s) => s.cl).filter(Boolean))]);
    const list = who ? pend.filter((s) => s.cl === who) : pend;
    const total = r2(sum(list, (s) => s.i));
    if (!list.length) return reply(who ? '✅ **' + who + '** no te debe nada.' : '✅ No tienes servicios pendientes de cobro.');
    const byClient = {};
    for (const s of list) byClient[s.cl || 'Sin cliente'] = r2((byClient[s.cl || 'Sin cliente'] || 0) + s.i);
    const detail = who ? list.map((s) => '• ' + fd(s.f) + ' · ' + (s.o || '') + ' → ' + (s.d || '') + ' · ' + eur(s.i)).join('\n')
      : Object.entries(byClient).sort((a, b) => b[1] - a[1]).map(([c, v]) => '• ' + c + ': ' + eur(v)).join('\n');
    return reply('⏳ ' + (who ? '**' + who + '** te debe' : 'Te deben') + ' **' + eur(total) + '** (' + list.length + (list.length === 1 ? ' servicio' : ' servicios') + ')\n' + detail,
      (who ? who + ' te debe ' : 'Te deben ') + spoken(total) + ' de ' + list.length + (list.length === 1 ? ' servicio' : ' servicios'));
  }

  // --- Servicios próximos ---
  if (/(proximo|siguiente|que tengo|tengo algo|servicios? (de|para)? ?(hoy|manana)|agenda|recogida)/.test(t) && !/(llev|gan|cobr)/.test(t)) {
    const target = has(t, 'manana') ? addDays(day, 1) : has(t, 'hoy') ? day : null;
    let list = state.srv.filter((s) => serviceTime(s) >= now.getTime() - 30 * 6e4).sort((a, b) => serviceTime(a) - serviceTime(b));
    if (target) list = list.filter((s) => s.f === target);
    else list = list.slice(0, /proximo|siguiente/.test(t) ? 1 : 3);
    if (!list.length) return reply(target ? '🗓️ No tienes servicios ' + (target === day ? 'hoy' : 'mañana') + '.' : '🗓️ No tienes servicios próximos apuntados.');
    const line = (s) => (s.f === day ? 'Hoy' : s.f === addDays(day, 1) ? 'Mañana' : fd(s.f)) + ' a las ' + s.h + ': ' + (s.o || '') + ' → ' + (s.d || '') +
      (s.pa ? ' · ' + s.pa : '') + (s.vu ? ' · vuelo ' + s.vu + (helpers.eta ? ' ' + helpers.eta(s) : '') : '');
    return reply('🚖 ' + list.map(line).join('\n🚖 '), (list.length > 1 ? 'Tienes ' + list.length + ' servicios. ' : '') + line(list[0]).replace(/→/g, 'a').replace(/·/g, ','));
  }

  // --- Último servicio con alguien ---
  if (/(cuando|ultima vez|cuantas veces|he llevado|lleve|llevamos)/.test(t) && /(llev|vez|veces)/.test(t)) {
    const who = findName(t, [...new Set(state.srv.flatMap((s) => [s.pa, s.cl]).filter(Boolean))]);
    if (!who) return reply('¿A quién? Dime el nombre del pasajero o del cliente, por ejemplo: «¿Cuándo llevé a Richard?»');
    const list = state.srv.filter((s) => s.pa === who || s.cl === who).sort((a, b) => b.f.localeCompare(a.f) || (b.h || '').localeCompare(a.h || ''));
    const last = list[0];
    return reply('🧳 **' + who + '**: ' + list.length + (list.length === 1 ? ' servicio' : ' servicios') + '. El último, el ' + fd(last.f) + ' a las ' + last.h + ': ' + (last.o || '') + ' → ' + (last.d || '') + ' · ' + eur(last.i),
      'Has llevado a ' + who + ' ' + list.length + (list.length === 1 ? ' vez' : ' veces') + '. La última, el ' + fd(last.f) + ', de ' + (last.o || '') + ' a ' + (last.d || '') + ', por ' + spoken(last.i));
  }

  // --- Gasolina ---
  if (/(gasolina|gasoil|diesel|combustible|repost|litros)/.test(t)) {
    const p = periodOf(t, day, 'mes');
    const list = state.gas.filter((g) => inRange(g.f, p));
    const total = r2(sum(list, (g) => g.i));
    const liters = r2(sum(list, (g) => g.l || 0));
    return reply('⛽ Gasolina ' + p.label + ': **' + eur(total) + '**' + (liters ? ' · ' + String(liters).replace('.', ',') + ' L' : '') + ' · ' + list.length + (list.length === 1 ? ' ticket' : ' tickets') + (liters ? ' · ' + eur(total / liters) + '/L de media' : ''),
      'En gasolina ' + p.label + ' llevas ' + spoken(total) + (liters ? ', ' + Math.round(liters) + ' litros' : ''));
  }

  // --- IVA / trimestre ---
  if (/(iva|impuesto|hacienda|trimestre|base imponible)/.test(t)) {
    const p = periodOf(t, day, 'hoy');
    const q = p.q || quarterOf(day);
    const d = quarterData(state, q);
    return reply('🧾 Trimestre ' + q.replace('-', ' ') + ': ingresos **' + eur(d.income) + '** · base **' + eur(d.base) + '** · IVA (' + d.iva + ' %) **' + eur(d.vat) + '** · gastos ' + eur(d.expenses),
      'En el trimestre llevas ' + spoken(d.income) + ' de ingresos. El IVA es ' + spoken(d.vat));
  }

  // --- Kilómetros y horas ---
  if (/(kilometro|km|kms|horas|trabajado|jornada)/.test(t)) {
    const p = periodOf(t, day, has(t, 'hoy') ? 'hoy' : 'mes');
    const jor = (state.jor || []).filter((j) => inRange(j.f, p));
    const km = r2(sum(jor, (j) => (j.kf > j.ki ? j.kf - j.ki : 0)));
    const h = r2(sum(jor, (j) => hoursOf(j) || 0));
    const net = money(state, p).net;
    return reply('🛣️ ' + p.label.charAt(0).toUpperCase() + p.label.slice(1) + ': **' + Math.round(km).toLocaleString('es-ES') + ' km** · **' + (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h** en ' + jor.length + (jor.length === 1 ? ' jornada' : ' jornadas') +
      (km ? ' · ' + eur(net / km) + '/km' : '') + (h ? ' · ' + eur(net / h) + '/h' : ''),
      p.label + ' llevas ' + Math.round(km) + ' kilómetros y ' + Math.round(h) + ' horas' + (h ? ', a ' + spoken(net / h) + ' la hora' : ''));
  }

  // --- Hucha ---
  if (/(hucha|ahorr)/.test(t)) {
    const lines = huchasOf(state.cfg).map((h) => { const s = huchaStatus(h, state.huc, day); return { h, s }; });
    return reply(lines.map(({ h, s }) => h.e + ' ' + h.n + ': **' + eur(s.saved) + '** de ' + eur(s.goal) + ' (' + s.pct + ' %)' + (s.done ? ' 🎉' : s.eta ? ' · llegas el ' + fd(s.eta) : '')).join('\n'),
      lines.map(({ h, s }) => 'En ' + h.n + ' llevas ' + spoken(s.saved) + ', el ' + s.pct + ' por ciento').join('. '));
  }

  // --- Mejor día ---
  if (/mejor dia|record/.test(t)) {
    const p = periodOf(t, day, 'mes');
    const byDay = {};
    for (const x of state.mov.filter((m) => inRange(m.f, p))) byDay[x.f] = r2((byDay[x.f] || 0) + (x.t === 'in' ? x.i : -x.i));
    const best = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    if (!best) return reply('Aún no hay días con movimientos ' + p.label + '.');
    return reply('🏆 Tu mejor día ' + p.label + ': **' + fd(best[0]) + '** con **' + eur(best[1]) + '** limpios.', 'Tu mejor día ' + p.label + ' fue el ' + fd(best[0]) + ', con ' + spoken(best[1]));
  }

  // --- Gastos ---
  if (/(gasto|gastado|gaste|pagado)/.test(t)) {
    const p = periodOf(t, day, 'mes');
    const list = state.mov.filter((x) => x.t === 'out' && inRange(x.f, p));
    const total = r2(sum(list, (x) => x.i));
    const byC = {};
    for (const x of list) { const k = (x.c || 'Otros').split(':')[0]; byC[k] = r2((byC[k] || 0) + x.i); }
    const top = Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => '• ' + k + ': ' + eur(v)).join('\n');
    return reply('🧾 Gastos ' + p.label + ': **' + eur(total) + '**' + (top ? '\n' + top : ''), 'Has gastado ' + spoken(total) + ' ' + p.label);
  }

  // --- Ganancias (lo más habitual) ---
  if (/(cuanto|llevo|gane|ganado|ganar|hecho|hice|facturad|ingres|neto|beneficio|caja|dinero|sacado|saque|cobrado|recaud)/.test(t)) {
    const who = findName(t, [...new Set(state.srv.map((s) => s.cl).filter(Boolean))]);
    const p = periodOf(t, day, /(llevo|hoy)/.test(t) ? 'hoy' : 'mes');
    if (who && /(factur|con |de |a )/.test(t)) {
      const list = state.srv.filter((s) => s.cl === who && inRange(s.f, p));
      const total = r2(sum(list, (s) => s.i));
      return reply('🤝 Con **' + who + '** ' + p.label + ': **' + eur(total) + '** en ' + list.length + (list.length === 1 ? ' servicio' : ' servicios') + '.',
        'Con ' + who + ' ' + p.label + ' llevas ' + spoken(total) + ' en ' + list.length + ' servicios');
    }
    const m = money(state, p);
    const prev = previous(p);
    let cmp = '';
    let cmpSpeech = '';
    if (prev) {
      const before = money(state, prev).net;
      if (before > 0) {
        const pct = Math.round(((m.net - before) / before) * 100);
        cmp = ' · ' + (pct >= 0 ? '📈 +' : '📉 ') + pct + ' % que el periodo anterior';
        cmpSpeech = pct >= 0 ? ', un ' + pct + ' por ciento más que antes' : ', un ' + -pct + ' por ciento menos que antes';
      }
    }
    return reply('💶 ' + p.label.charAt(0).toUpperCase() + p.label.slice(1) + ': **' + eur(m.net) + ' limpios**\nIngresos ' + eur(m.inc) + ' (' + m.count + (m.count === 1 ? ' cobro' : ' cobros') + ') · gastos ' + eur(m.out) + cmp,
      p.label.charAt(0).toUpperCase() + p.label.slice(1) + ' llevas ' + spoken(m.net) + ' limpios' + cmpSpeech);
  }

  return reply('No te he entendido bien 🤔 Prueba con: «¿Cuánto llevo hoy?», «¿Qué tengo mañana?», «¿Cuánto me debe Charly?» o «Apunta 45 euros en efectivo».',
    'No te he entendido. Prueba a preguntarme cuánto llevas hoy, o qué tienes mañana.');
}
