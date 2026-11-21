// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Asistente de Rutivo: entiende preguntas y órdenes en español sobre tus datos.
// Funciones puras: todo se calcula en el móvil, sin enviar nada fuera.
import { huchaStatus, huchasOf } from './huchas.js';
import { hoursOf } from './jornada.js';
import { cashStats, invoiceTotals } from './money.js';
import { quarterData } from './report.js';
import { serviceTime } from './trips.js';
import { MONTHS, eur, fd, quarterOf, r2, sum } from './utils.js';
import { driverName } from './welcome.js';

// ---------- texto ----------

/** Minúsculas, sin tildes y sin signos, con los números escritos pasados a cifras. */
export function normalize(text) {
  let t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2') // «1.200 euros» → 1200
    .replace(/(\d)\s*(?:€|eur\b)/g, '$1 euros')
    .replace(/[¿?¡!.,;:"«»()]/g, (c, i, s) => (c === ',' && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '') ? '.' : ' '))
    .replace(/\s+/g, ' ')
    .trim();
  t = wordsToNumbers(t);
  return fixDictation(t);
}

// Palabras que Rutivo conoce; con ruido, el dictado las cambia por otras parecidas.
const VOCAB = ['apunta', 'apuntame', 'apuntar', 'anotame', 'ingresa', 'ingresame', 'ingresar', 'ponme', 'meteme', 'sumame',
  'euros', 'efectivo', 'tarjeta', 'datafono', 'bizum', 'transferencia', 'gasolina', 'gasoil', 'diesel', 'peaje', 'parking', 'propina',
  'lavado', 'taller', 'desayuno', 'hucha', 'resumen', 'kilometros', 'trimestre',
  'apuntado', 'anotado', 'ingresado', 'pagado', 'cobrado', 'gastado', 'apuntando', 'ingresos', 'tarjetas'];
// Palabras normales que se parecen a las de arriba y NO hay que tocar
const KNOWN = ['pasado', 'pasada', 'semana', 'cuando', 'cuanto', 'cuantos', 'cuantas', 'llevo', 'llevado', 'lleve', 'gastos', 'ganado', 'pagar',
  'pague', 'gaste', 'cobre', 'pasaje', 'pasajero', 'tardes', 'hecho', 'mismo', 'resto', 'cuenta', 'puesto', 'ponemos', 'metido', 'sumado',
  'efecto', 'tarde', 'hacia', 'manana', 'carrera', 'carreras', 'servicio', 'servicios', 'trabajo', 'gracias', 'ingreso', 'tengo', 'proximo'];
const VSET = new Set([...VOCAB, ...KNOWN]);
// Confusiones típicas que la distancia no arregla bien
const SOUNDS = { heroes: 'euros', eros: 'euros', uros: 'euros', ueros: 'euros', euroz: 'euros', efectiva: 'efectivo', electivo: 'efectivo',
  afectivo: 'efectivo', defectivo: 'efectivo', targeta: 'tarjeta', derjeta: 'tarjeta', terjeta: 'tarjeta', darjeta: 'tarjeta', tarjeda: 'tarjeta', tarjet: 'tarjeta', tarjetas: 'tarjeta', apuntamos: 'apunta', apuntan: 'apunta', apuntes: 'apunta',
  apunte: 'apunta', apuntadme: 'apuntame', ingreso: 'ingreso', propinas: 'propina', peajes: 'peaje', gasolinera: 'gasolina' };

function dist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Cambia cada palabra desconocida por la conocida más parecida (si se parece mucho). */
export function fuzzyFix(t) {
  return t.split(' ').map((w) => {
    if (SOUNDS[w]) return SOUNDS[w];
    if (w.length < 5 || VSET.has(w) || /\d/.test(w)) return w;
    let best = null;
    let bd = w.length >= 8 ? 3 : 2;
    for (const v of VOCAB) {
      const dd = dist(w, v);
      if (dd < bd || (dd === bd && best && v.length === w.length)) { best = v; bd = dd; }
    }
    return best && bd <= (w.length >= 8 ? 2 : 1) ? best : w;
  }).join(' ');
}

/** «¿A qué hora salgo?», «¿cuándo tengo que salir?» */
const LEAVE = /\b(a que hora|cuando)\b.*\b(salgo|salir|sali|me voy|tengo que irme|me pongo en marcha)\b|\bsal ya\b/;

/**
 * «¿Me compensa un servicio de 60 euros del aeropuerto a Marbella?» →
 * {kind:'worth', price, from, to}. null si no es esa pregunta.
 */
export function worthIntent(t) {
  if (!/\b(compensa|compensaria|merece la pena|vale la pena|sale a cuenta|sale rentable|es rentable)\b/.test(t)) return null;
  const price = amountOf(t);
  const rest = t.replace(/\b\d+(\.\d+)?\s*(euros?)?\b/g, ' ').replace(/\s+/g, ' ').trim();
  const to = ((rest.match(/\b(?:hasta|a|para)\s+(?:el |la |los |las )?([a-z0-9 ]{3,}?)(?:\s+(?:por|de|con|y)\b.*)?$/) || [])[1] || '').trim();
  const from = ((rest.match(/\b(?:desde|del|de la)\s+(?:el |la )?([a-z0-9 ]+?)\s+(?:hasta|a|para)\b/) || [])[1] || '').trim();
  if (!price || !to) {
    return { kind: 'answer', text: 'Dime el precio y adónde es. Por ejemplo: «¿Me compensa 60 euros del aeropuerto a Marbella?»', speech: 'Dime el precio y adónde es. Por ejemplo: me compensa sesenta euros del aeropuerto a Marbella.' };
  }
  return { kind: 'worth', price, from: from === 'aeropuerto' ? 'Aeropuerto de Málaga' : from, to, text: '💶 Lo calculo…', speech: '' };
}

/**
 * Con radio o gente hablando, el oído coge frases de fondo antes de la orden.
 * Si antes de la orden (verbo o importe) hay mucha charla, se quita.
 */
export function trimChatter(text) {
  const s = String(text || '').trim();
  const m = s.match(/\b(ap[uú]nta|an[oó]ta|ingres|a punto|p[oó]n(me)?\b|m[eé]te(me)?\b|s[uú]ma(me)?\b|\d)/i);
  if (!m) return s;
  const before = s.slice(0, m.index).trim();
  return before.split(/\s+/).length > 4 ? s.slice(m.index) : s;
}

/** Errores típicos del dictado y formas de decir importes. */
function fixDictation(t) {
  t = fuzzyFix(t);
  return t
    .replace(/\ba (puntame|punta|puntalo|puntar|notame|nota|notar)\b/g, 'a$1')
    .replace(/\ba punto (de |me |de me )?(?=\d)/g, 'apuntame ') // Whisper: «apúntame 15» → «a punto de 15»
    .replace(/\b(apunta|anota|ingresa|pon|mete|suma|guarda|registra) (me|melo|lo)\b/g, '$1$2')
    .replace(/\b(tarjetas|targeta|targetas)\b/g, 'tarjeta')
    // Como se habla: «cobrao», «pagao», «echao» → cobrado, pagado, echado
    .replace(/\b(cobr|pag|gast|ech|apunt|repost|ingres|lav|aparc|anot|gan|sac)ao\b/g, '$1ado')
    // «pavos», «euritos»… → euros
    .replace(/\b(pavos|pavo|euritos|eurillos|eurazos|lereles)\b/g, 'euros')
    // «grábame 10», «apúntate 10», «apúntamelo» → apúntame
    .replace(/\b(grabame|graba|grabalo|apuntate|apuntamelo|anotamelo|anotate)\b/g, 'apuntame')
    // «me han dado 20», «he sacado 30» (de una carrera) → me han pagado
    .replace(/^(me han dado|me ha dado|me dieron|me dio|he sacado|saque|he ganado) (?=\d)/, 'me han pagado ')
    .replace(/\b(apple pay|google pay|samsung pay|con el reloj|paypal|con la visa)\b/g, 'tarjeta')
    .replace(/\b(en suelto|contante|en contante|en billete)\b/g, 'efectivo')
    .replace(/\b(efectivos|en mano|en metalico|cash|en billetes)\b/g, 'efectivo')
    .replace(/\b(\d+) (?:euros? )?con (\d{1,2})\b/g, (m, e, c) => e + '.' + c.padEnd(2, '0') + ' euros')
    .replace(/\b(\d+) (?:euros? )?y medio\b/g, '$1.50 euros')
    .replace(/\b(\d+) euros? (\d{2})\b(?= (en|con|por)\b|$)/g, (m, e, c) => e + '.' + c + ' euros') // «doce euros cincuenta»
    .replace(/\beuros euros\b/g, 'euros')
    .replace(/\s+/g, ' ')
    .trim();
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
  const withEuros = t.match(/(\d+(?:\.\d{1,2})?)\s*(?:euros?|pavos)\b/);
  if (withEuros) return +withEuros[1];
  const afterVerb = t.match(/\b(?:apunt|anot|ingres|pon|mete|sum|cobr|pag|gast|ech|carrera|gasto|ingreso|propina)[a-z]*\s+(?:(?:un|una|de|me|lo|el|la)\s+)*(\d+(?:\.\d{1,2})?)/);
  if (afterVerb) return +afterVerb[1];
  const m = t.match(/(\d+(?:\.\d{1,2})?)/);
  return m ? +m[1] : null;
};

const reply = (text, speech, extra = {}) => ({ kind: 'answer', text, speech: speech || text.replace(/\*\*/g, ''), ...extra });

/**
 * Responde a lo que dice el usuario. Devuelve
 *  {kind:'answer', text, speech} o
 *  {kind:'action', action:{list, item}, text, speech} (la vista lo guarda y permite deshacer).
 */
// Verbos de "apuntar", con o sin pronombre: apúntame, ingrésame, ponme, mételo…
const WRITE_VERB = /^(apunta|apuntar|anota|anotar|anade|anadir|pon|poner|mete|meter|registra|registrar|suma|sumar|guarda|guardar|ingresa|ingrese|ingresar|ingres|cobra|carga|cargar|agrega|agregar|incluye|incluir)(me|lo|la|le|melo|mela|selo)?( |$)/;
const WRITE_PHRASE = /^(me han pagado|me pagaron|me ha pagado|me han dejado|me dejaron|he cobrado|cobre|cobrado|acabo de cobrar|acabo de hacer|he hecho (una carrera|un servicio|un viaje|un traslado)( de)?|he hecho|he gastado|gaste|he pagado|pague|acabo de pagar|he echado|eche|he puesto|he repostado|reposte|repostado|ahorra|ahorrame)( |$)/;
const QUESTION = /^(cuanto|cuantos|cuantas|cuando|que|quien|quienes|como|cual|cuales|donde|dime|sabes|resumen|dame)( |$)/;

/** ¿Es una orden de apuntar dinero? */
const WRITE_ANY = /\b(apunt|anot|ingres|registr|anad|agreg)[a-z]*\b|\b(ponme|pon|meteme|mete|sumame|guardame|cobra|cobrado|cobre|pagado|pague|gaste|gastado|echado|eche|reposte|repostado)\b|\bcomo (ingreso|gasto)\b/;

const STATEMENT = /\b(efectivo|metalico|tarjeta|datafono|bizum|transferencia|visa|propina|peaje|parking|gasolina|gasoil|diesel|taller|lavado|seguro|carrera|servicio|traslado|viaje|transfer|cobro|entrada|salida|gasto|ingreso|euros|hucha)\b/;
const ASKING = /\b(cuanto|cuanta|cuantos|cuantas|que tal|dime|muestrame|ensename|cual|cuales|resumen|llevo (de|en)|tengo)\b/;

export function isWrite(t) {
  if (QUESTION.test(t)) return false;
  if (WRITE_VERB.test(t) || WRITE_PHRASE.test(t)) return true;
  if (WRITE_ANY.test(t) && amountOf(t) !== null) return true; // "para apuntar 12 euros…", "12 euros como ingreso"
  if (/^(un |una )?(nuevo |nueva |otro |otra )?(gasto|ingreso|carrera|cobro|servicio|viaje|traslado|transfer|entrada|salida|propina|peaje|parking|lavado|taller|gasolina|gasoil|diesel) (de )?\d/.test(t)) return true;
  // Una frase (no pregunta) con importe y algo de dinero: «peaje de 6 euros con tarjeta», «gasolina 45 con tarjeta»
  if (amountOf(t) !== null && STATEMENT.test(t) && !ASKING.test(t)) return true;
  // Solo importe y forma de pago: "50 euros en efectivo", "30 con tarjeta"
  return /^\d+(\.\d+)? ?(euros?|pavos)?( (en|con|por) (el |la )?(efectivo|tarjeta|metalico|bizum|datafono|visa|transferencia|tpv))?$/.test(t);
}

const EXPENSES = [
  [/gasolina|gasoil|gasoleo|diesel|combustible|reposta|repostado|reposte|repostaje|echado|eche/, 'Gasolina'], [/peaje|autopista|ap ?7/, 'Peaje'],
  [/parking|aparcamiento|aparcar|garaje|cochera|parquimetro|zona azul/, 'Parking'], [/lavado|lavar|lavadero|lavacoches|tunel de lavado|aspirado/, 'Lavado'], [/\bitv\b/, 'ITV'],
  [/taller|mecanico|revision|aceite|neumatico|rueda|frenos|bateria|pinchazo|chapa|pintura|embrague|filtro/, 'Taller'], [/comida|almuerzo|desayuno|cena|cafe|bocadillo|menu|merienda|tapa|pincho|refresco|bebida|\bagua\b/, 'Comida'],
  [/gestor|gestoria|asesoria|asesor/, 'Gestoría'],
  [/seguro/, 'Seguro'], [/multa/, 'Multa'], [/movil|telefono|tarifa de datos/, 'Teléfono'], [/autonomos|cuota|licencia|emisora/, 'Cuotas'],
  [/recambio|pieza|accesorio/, 'Recambios'], [/limpieza|ambientador/, 'Limpieza'],
];
const INCOMES = [[/propina/, 'Propina'], [/transfer/, 'Transfer'], [/aeropuerto/, 'Carrera aeropuerto'], [/servicio/, 'Servicio'], [/suplemento/, 'Suplemento'], [/\bespera\b/, 'Espera']];

const CONCEPT_FIX = { cadera: 'carrera', caderas: 'carreras', caldera: 'carrera', calderas: 'carreras', carera: 'carrera', carreta: 'carrera', carrea: 'carrera', carrena: 'carrera',
  casolina: 'gasolina', gasolinas: 'gasolina', parkin: 'parking', parquin: 'parking', peage: 'peaje', propinas: 'propina', lavao: 'lavado' };

// Palabras de conceptos que Rutivo conoce de serie; además aprende las tuyas (las de tus apuntes)
const BASE_WORDS = ['carrera', 'carreras', 'primera', 'segunda', 'tercera', 'ultima', 'gasolina', 'gasoil', 'peaje', 'parking', 'lavado', 'propina',
  'transfer', 'aeropuerto', 'hotel', 'servicio', 'taller', 'comida', 'cafe', 'desayuno', 'seguro', 'multa', 'recambios', 'limpieza', 'estacion',
  'puerto', 'centro', 'marbella', 'malaga', 'torremolinos', 'benalmadena', 'fuengirola', 'nerja', 'estepona', 'mijas', 'ronda', 'antequera'];

// Lo que NO es concepto (se quita de la frase): órdenes, importe, tipo, forma de pago, relleno
const NOT_CONCEPT = [
  // Reparto del pago: «60 en efectivo y el resto con tarjeta», «la mitad en cada uno»
  /\b\d+(\.\d+)?\s*(euros?\s*)?(en|con|por)\s+(el |la )?(efectivo|metalico|tarjeta|datafono|visa|bizum|transferencia|tpv)\b/g,
  /\b(y )?(el resto|lo demas|lo otro)\b/g,
  /\b(la mitad( en cada uno| y la mitad)?|mitad y mitad|a medias|a partes iguales)\b/g,
  /\b(anade|anademe|anadir|agrega|agregame|agregar|registra|registrame|registrar|incluye|incluyeme|apuntalo|anotalo|guardalo)\b/g,
  /\b(acabo de (cobrar|pagar|hacer)|me (han|ha) dejado|me dejaron|he hecho|nuevo|nueva|entrada|salida|ahorra|ahorrame)\b/g,
  /\b\d+(\.\d+)?\s*(litros?)\b/g,
  /\b(quiero|quisiera|necesito|puedes|podrias|me puedes) (que )?(me )?/g,
  /\b(apuntame|apunta|apuntalo|apuntar|apuntes|apuntas|anotame|anota|anotar|ingresame|ingresa|ingresar|ponme|pon|meteme|mete|sumame|suma|registra|guarda|guardame)\b/g,
  /\b(he pagado|pague|pagado|he gastado|gaste|gastado|he echado|eche|echado|he cobrado|cobre|cobrado|me han pagado|me pagaron|me ha pagado)\b/g,
  /\b(como|de|un|una|en|por|para)?\s*(ingreso|gasto|cobro|pago)s?\b/g,
  /\b(en|con|por|y)?\s*(el |la )?(efectivo|tarjeta|metalico|bizum|datafono|visa|mastercard|transferencia|tpv|contactless|cash)\b/g,
  /\b(o+y+e+|hey|oye|hoy el)?\s*(rutivo|rutibo|ruto|rutio)\b/g,
  /\b(por favor|gracias|vale|venga|oye|hola|porfa)\b/g,
  /\b(esto|eso|esta|esa)\b/g, // «apúntame esto en ingreso…»
  /\b(en )?concepto( de)?\b/g,
];
const EDGE = /^(de|del|por|para|en|con|como|la|el|los|las|lo|al|a|y|e|que|me|un|una|mi|su)\s+|\s+(de|del|por|para|en|con|como|la|el|los|las|y|a|que)$/;

const wordsKnown = (state) => {
  const set = new Map(BASE_WORDS.map((w) => [w, w]));
  for (const m of (state && state.mov) || []) for (const w of normalize(m.c || '').split(' ')) if (w.length >= 4 && !/\d/.test(w)) set.set(w, w);
  return set;
};

/** Corrige palabras mal oídas hacia las que Rutivo ya conoce (las tuyas y las de serie). */
function learnFix(words, state) {
  const known = wordsKnown(state);
  return words.map((w) => {
    if (CONCEPT_FIX[w]) return CONCEPT_FIX[w];
    if (w.length < 4 || /\d/.test(w) || known.has(w)) return w;
    let best = null;
    let bd = w.length >= 7 ? 3 : 2;
    for (const k of known.keys()) {
      const d = dist(w, k);
      if (d < bd) { best = k; bd = d; }
    }
    return best && bd <= (w.length >= 7 ? 2 : 1) ? best : w;
  });
}

/**
 * El concepto tal como lo dices: todo lo que no es la orden, el importe, el
 * tipo (ingreso/gasto) ni la forma de pago. «…15 euros de primera carrera,
 * efectivo» → «Primera carrera»; «…como gasto de peaje» → «Peaje».
 * Corrige palabras mal oídas con tu propio vocabulario y respeta tus tildes y
 * mayúsculas. Devuelve '' si no dijiste concepto.
 */
export function conceptOf(original, state = null) {
  let t = normalize(original);
  // El importe (solo ese número: «carrera 1» o «AP-7» se quedan)
  t = /\b\d+(\.\d+)?\s*(euros?|pavos|eur)\b/.test(t) ? t.replace(/\b\d+(\.\d+)?\s*(euros?|pavos|eur)\b/, ' ') : t.replace(/\b\d+(\.\d+)?\b/, ' ');
  for (const re of NOT_CONCEPT) t = t.replace(re, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 6; i++) t = t.replace(EDGE, '').trim();
  // Muletillas al principio o al final («digo», «pues», «mira»…) no son concepto
  const FILL = /^(me|te|se|de|del|a|al|y|e|o|que|ver|digo|dime|pues|mira|bueno|eh|este|esta|ahora|ya|hoy|otra|otro|vez|lo|la|el|un|una|en|por|para|con|como|si|no)$/;
  let ws = t.split(' ').filter(Boolean);
  while (ws.length && FILL.test(ws[0])) ws.shift();
  while (ws.length && FILL.test(ws[ws.length - 1])) ws.pop();
  t = ws.join(' ');
  if (!t || t.split(' ').length > 7) return '';
  const words = learnFix(t.split(' '), state);
  if (words.length === 1 && /^(gasoil|diesel|combustible|gasolina|gasofa|repostado|repostar|reposte|repostaje)$/.test(words[0])) return 'Gasolina';
  // Si dices un concepto que ya usaste (aunque se oiga un poco distinto), se escribe igual que siempre
  if (state && state.mov) {
    const key = (x) => normalize(x).replace(/[^a-z0-9]/g, '');
    const said = key(words.join(' '));
    const used = [...new Set(state.mov.map((m) => m.c).filter(Boolean))];
    const digits = (x) => (x.match(/\d+/g) || []).join(',');
    const prev = used.find((c) => key(c) === said) ||
      (said.length >= 6 && used.find((c) => key(c).length >= 6 && digits(key(c)) === digits(said) && dist(key(c), said) <= 1));
    if (prev) return prev;
  }
  // Recuperar tildes y mayúsculas de lo que dijiste («café», «Richard»)
  const orig = String(original || '').split(/[\s,.;:¿?¡!]+/).filter(Boolean);
  const pretty = words.map((w) => orig.find((o) => normalize(o) === w) || w).join(' ');
  return (pretty.charAt(0).toUpperCase() + pretty.slice(1)).slice(0, 50);
}

// ---------- forma de pago ----------

/** «tarjeta», «efectivo» o null si no lo dice. */
export function payOf(t) {
  if (/\b(tarjeta|datafono|visa|mastercard|bizum|transferencia|tpv|contactless|con el movil)\b/.test(t)) return 'tarjeta';
  if (/\b(efectivo|metalico)\b/.test(t)) return 'efectivo';
  return null;
}
const PAY_WORD = '(efectivo|metalico|tarjeta|datafono|visa|bizum|transferencia|tpv)';
const asPay = (w) => (/^(efectivo|metalico)$/.test(w) ? 'efectivo' : 'tarjeta');

/**
 * Cobro (o pago) repartido entre efectivo y tarjeta:
 * «la mitad en cada uno», «60 en efectivo y 40 con tarjeta», «20 con tarjeta y el resto en efectivo».
 * Devuelve [{p, i}, {p, i}], {error} si no cuadra, o null si no es un reparto.
 */
export function payParts(t, total) {
  if (/\b(la mitad|mitad y mitad|a medias|a partes iguales|mitad en cada)\b/.test(t) && total) {
    const a = r2(Math.round(total * 50) / 100);
    return [{ p: 'efectivo', i: a }, { p: 'tarjeta', i: r2(total - a) }];
  }
  const re = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:euros?\\s*)?(?:en|con|por)\\s+(?:el |la )?' + PAY_WORD + '\\b', 'g');
  const found = [...t.matchAll(re)].map((m) => ({ p: asPay(m[2]), i: +m[1] }));
  const rest = t.match(new RegExp('\\b(?:el resto|lo demas|lo otro)\\s+(?:en|con|por)\\s+(?:el |la )?' + PAY_WORD + '\\b'));
  if (found.length === 1 && rest && total && total > found[0].i) {
    const other = asPay(rest[1]);
    if (other === found[0].p) return null;
    return [found[0], { p: other, i: r2(total - found[0].i) }];
  }
  if (found.length === 2 && found[0].p !== found[1].p) {
    const sumParts = r2(found[0].i + found[1].i);
    if (total && total !== found[0].i && Math.abs(total - sumParts) > 0.009) {
      return { error: 'No me cuadra: ' + eur(found[0].i) + ' y ' + eur(found[1].i) + ' son ' + eur(sumParts) + ', no ' + eur(total) + '. Dímelo otra vez.' };
    }
    return found;
  }
  return null;
}

/** «… 40 litros» */
function litersOf(t) {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:litros?|l)\b/);
  return m ? +m[1] : 0;
}

const payWords = (p) => (p === 'tarjeta' ? 'con tarjeta' : 'en efectivo');
const kindWord = (it) => (it.t === 'out' ? 'gasto' : 'ingreso');

/** «35,00 € en efectivo» / «60,00 € en efectivo y 40,00 € con tarjeta» */
function partsText(items, speech = false) {
  return items.map((x) => (speech ? spoken(x.i) : eur(x.i)) + ' ' + payWords(x.p)).join(' y ');
}

/** La acción de apuntar (una o dos partes) con lo que se enseña y se dice. */
function makeAction(base, parts, gas, said, prefix = '') {
  const items = parts.map((x) => ({ ...base, p: x.p, i: r2(x.i) }));
  const out = base.t === 'out';
  const action = items.length === 1 ? { list: 'mov', item: items[0] } : { list: 'mov', item: items[0], items };
  if (gas) action.gas = gas;
  const total = r2(sum(items, (x) => x.i));
  const text = (out ? '🧾 Gasto apuntado: **' : '💶 Apuntado: **') + eur(total) + '** · ' +
    (items.length === 1 ? items[0].p : partsText(items)) + ' · ' + base.c + (gas ? ' (también en Gasolina)' : '');
  const speech = prefix + (out ? 'Gasto apuntado: ' : 'Apuntado: ') +
    (items.length === 1 ? spoken(total) + ' ' + payWords(items[0].p) : spoken(total) + ': ' + partsText(items, true)) + (said ? ', por ' + base.c : '');
  return { kind: 'action', action, text, speech };
}

/** Falta la forma de pago: se pregunta solo eso. */
function askPay(base, gas, said) {
  const q = base.t === 'out' ? '¿Lo has pagado en efectivo o con tarjeta?' : '¿Lo has cobrado en efectivo o con tarjeta?';
  return reply('💳 ' + eur(base.i) + ' · ' + base.c + '. ' + q + ' (También: «la mitad en cada uno» o «20 en efectivo y el resto con tarjeta».)', q,
    { slot: { base, gas, said } });
}

/** Cómo se describe lo apuntado (para preguntar si se quita o se repite). */
export function describeDone(done) {
  if (!done || !done.items || !done.items.length) return '';
  const it = done.items[0];
  if (done.list === 'huc') return eur(it.i) + ' en la hucha';
  return 'el ' + kindWord(it) + ' de ' + partsText(done.items) + (it.c ? ' (' + it.c + ')' : '');
}

const sig = (items) => JSON.stringify(items.map((x) => [x.t, x.p, x.i, x.c, x.h]));

function answer(t, state, now, helpers) {
  const day = iso(now);
  // --- Órdenes: apuntar ---
  const amount = amountOf(t);
  if ((isWrite(t) || (!QUESTION.test(t) && WRITE_ANY.test(t))) && !amount) {
    return reply('Claro. ¿De cuánto? Dímelo así: «30 euros en efectivo» o «12 con tarjeta».', 'Claro. ¿De cuánto?', { pending: 'apunta' + (/(gasto|gaste|pague|pagado|gasolina|peaje|parking)/.test(t) ? ' gasto' : '') });
  }
  if (isWrite(t) && amount) {
    if (has(t, 'hucha', 'huchas') || /^ahorra(me)?( |$)/.test(t)) {
      const hs = huchasOf(state.cfg);
      const h = hs.find((x) => has(t, clean(x.n).split(' ').pop())) || hs[0];
      return { kind: 'action', action: { list: 'huc', item: { f: day, i: r2(amount), h: h.id } },
        text: '🐷 Metidos **' + eur(amount) + '** en «' + h.n + '».', speech: 'Metidos ' + spoken(amount) + ' en ' + h.n };
    }
    const cat = EXPENSES.find(([re]) => re.test(t));
    const forcedIn = /como (ingreso|cobro|carrera)|me (han|ha) pagado|me pagaron|propina|he cobrado|cobre/.test(t);
    const expense = !forcedIn && (!!cat || /gasto|gaste|gastado|pagado|pague|como gasto|\bsalida de\b/.test(t));
    const fuel = false;
    const income = INCOMES.find(([re]) => re.test(t));
    const said = conceptOf(helpers.original || t, state);
    const c = said || (expense ? (cat ? cat[1] : 'Gasto') : income ? income[1] : 'Carrera');
    const type = expense || fuel ? 'out' : 'in';
    // Gasolina: también va a la pantalla Gasolina (con los litros si los dices)
    const gas = type === 'out' && cat && cat[1] === 'Gasolina' ? { l: litersOf(t), s: '' } : null;
    const base = { f: day, t: type, i: r2(amount), c };
    // Cobrado en dos partes: «60 en efectivo y 40 con tarjeta», «la mitad en cada uno»
    const parts = payParts(t, amount);
    if (parts && parts.error) return reply(parts.error, parts.error);
    if (parts) return makeAction(base, parts, gas, !!said);
    const pay = payOf(t);
    // Sin forma de pago: se pregunta (antes se daba por hecho «efectivo»)
    if (!pay) return askPay(base, gas, !!said);
    return makeAction(base, [{ p: pay, i: base.i }], gas, !!said);
  }

  // --- Ir a una pantalla («abre la gasolina») ---
  const NAV = [[/\b(caja|inicio|principal|jornada)\b/, 'hoy', 'la Caja'], [/\b(transfer|transfers|agenda|servicios|reservas)\b/, 'tr', 'Transfer'],
    [/\b(gasolina|tickets?|combustible)\b/, 'ga', 'Gasolina'], [/\b(facturas?|facturacion)\b/, 'fa', 'Facturas'], [/\b(huchas?|ahorros?)\b/, 'hu', 'la Hucha']];
  if (/^(abre|abreme|ensename|ensena|llevame|vete|ve|ir|pasa|cambia|muestrame la pantalla|pon la pantalla)( (a|al|a la|la|el|las|los|mi|mis|pantalla de|pantalla del))* /.test(t)) {
    const nav = NAV.find(([re]) => re.test(t));
    if (nav) return { kind: 'nav', view: nav[1], text: '📲 Te abro ' + nav[2] + '.', speech: 'Te abro ' + nav[2] + '.' };
  }

  // --- Crear facturas por voz: no (hacen falta los datos del cliente y elegir servicios) ---
  if (/^(hazme|haz|crea|creame|emite|emiteme|genera|generame|saca|sacame) (una |la |otra )?factura/.test(t)) {
    return { kind: 'nav', view: 'fa', text: '🧾 Las facturas se crean en la pantalla Facturas (eliges el cliente y los servicios, y quedan selladas). Te la abro.', speech: 'Las facturas se crean en la pantalla de facturas. Te la abro.' };
  }

  // --- Lo facturado (facturas emitidas) ---
  if (/factur/.test(t) && !findName(t, [...new Set(state.srv.map((s) => s.cl).filter(Boolean))]) && !/(iva|impuesto)/.test(t)) {
    const p = periodOf(t, day, 'mes');
    const list = (state.fac || []).filter((f) => inRange(f.fecha || '', p));
    const issued = list.filter((f) => !f.tipo || f.tipo === 'F1');
    const tot = list.reduce((a, f) => { const x = invoiceTotals(f); return { t: r2(a.t + x.t), b: r2(a.b + x.b), v: r2(a.v + x.v) }; }, { t: 0, b: 0, v: 0 });
    const annulled = issued.filter((f) => f.anulada).length;
    if (!list.length) return reply('🧾 No has emitido facturas ' + p.label + '.', 'No has emitido facturas ' + p.label + '.');
    return reply('🧾 Facturado ' + p.label + ': **' + eur(tot.t) + '** en ' + issued.length + (issued.length === 1 ? ' factura' : ' facturas') +
      (annulled ? ' (' + annulled + ' anulada' + (annulled === 1 ? '' : 's') + ', ya restada' + (annulled === 1 ? '' : 's') + ')' : '') + '\nBase ' + eur(tot.b) + ' · IVA ' + eur(tot.v),
    'Has facturado ' + spoken(tot.t) + ' ' + p.label + ', en ' + issued.length + (issued.length === 1 ? ' factura' : ' facturas'));
  }

  // --- Efectivo / tarjeta («¿cuánto tengo en efectivo?») ---
  if (/\b(efectivo|metalico|en mano|tarjeta|datafono)\b/.test(t) && !/(gast|pag)/.test(t)) {
    const p = periodOf(t, day, 'hoy');
    const c = cashStats(state.mov.filter((x) => inRange(x.f, p)));
    const label = p.label.charAt(0).toUpperCase() + p.label.slice(1);
    if (/tarjeta|datafono/.test(t) && !/efectivo|metalico/.test(t)) {
      return reply('💳 ' + label + ' con tarjeta: **' + eur(c.inCard) + '** cobrados · ' + eur(c.inCard - c.netCard) + ' pagados con tarjeta.',
        label + ' has cobrado ' + spoken(c.inCard) + ' con tarjeta.');
    }
    return reply('💵 ' + label + ' en efectivo: **' + eur(c.netCash) + '** (cobrado ' + eur(c.inCash) + ' · pagado en efectivo ' + eur(c.inCash - c.netCash) + ')\nCon tarjeta: ' + eur(c.inCard) + '. Según lo apuntado en la caja.',
      label + ' llevas ' + spoken(c.netCash) + ' en efectivo, quitando lo que has pagado en efectivo. Con tarjeta, ' + spoken(c.inCard) + '.');
  }

  // --- Último servicio o cobro ---
  if (/\bultim[oa]s? (servicio|carrera|viaje|cobro|traslado|transfer)\b/.test(t)) {
    const nowMs = now.getTime();
    const s = state.srv.filter((x) => serviceTime(x) <= nowMs).sort((a, b) => serviceTime(b) - serviceTime(a))[0];
    const m = [...state.mov].reverse().find((x) => x.t === 'in');
    if (/(servicio|traslado|transfer|viaje)/.test(t) && s) {
      return reply('🚖 Tu último servicio: ' + fd(s.f) + ' a las ' + s.h + ' · ' + (s.o || '') + ' → ' + (s.d || '') + (s.cl ? ' · ' + s.cl : '') + ' · **' + eur(s.i) + '**' + (s.p === 'pendiente' ? ' (pendiente de cobro)' : ''),
        'Tu último servicio fue el ' + fd(s.f) + ', de ' + (s.o || '') + ' a ' + (s.d || '') + ', por ' + spoken(s.i));
    }
    if (m) return reply('💶 Lo último que cobraste: **' + eur(m.i) + '** ' + payWords(m.p) + (m.c ? ' · ' + m.c : '') + ' (' + fd(m.f) + ').', 'Lo último que cobraste fueron ' + spoken(m.i) + ' ' + payWords(m.p) + '.');
    return reply('Aún no tienes servicios ni cobros apuntados.');
  }

  // --- Cuántos servicios (la agenda de Transfer) ---
  if (/(cuant[oa]s (servicios|traslados|transfers|recogidas)|numero de servicios)/.test(t)) {
    const p = periodOf(t, day, 'hoy');
    const nowMs = now.getTime();
    const list = state.srv.filter((s) => inRange(s.f, p) && serviceTime(s) <= nowMs);
    const total = r2(sum(list, (s) => s.i));
    const pend = list.filter((s) => s.p === 'pendiente').length;
    const m = money(state, p);
    const label = p.label.charAt(0).toUpperCase() + p.label.slice(1);
    return reply('🚖 ' + label + ': **' + list.length + (list.length === 1 ? ' servicio' : ' servicios') + '** realizados por ' + eur(total) + (pend ? ' (' + pend + ' sin cobrar)' : '') +
      '\nEn la caja: ' + m.count + (m.count === 1 ? ' cobro' : ' cobros') + ' por ' + eur(m.inc) + '.',
    label + ' llevas ' + list.length + (list.length === 1 ? ' servicio' : ' servicios') + ' de transfer, por ' + spoken(total) + '. Y en la caja, ' + m.count + (m.count === 1 ? ' cobro.' : ' cobros.'));
  }

  // --- Rentabilidad ---
  if (/(rentab|margen|beneficio|me sale a cuenta|gano (por|a la) (hora|kilometro)|cuanto gano por)/.test(t)) {
    const p = periodOf(t, day, 'mes');
    const m = money(state, p);
    const fuel = r2(sum(state.mov.filter((x) => x.t === 'out' && inRange(x.f, p) && /^gasolina/i.test(x.c || '')), (x) => x.i));
    const jor = (state.jor || []).filter((j) => inRange(j.f, p));
    const km = r2(sum(jor, (j) => (j.kf > j.ki ? j.kf - j.ki : 0)));
    const h = r2(sum(jor, (j) => hoursOf(j) || 0));
    const pct = m.inc > 0 ? Math.round((m.net / m.inc) * 100) : 0;
    const label = p.label.charAt(0).toUpperCase() + p.label.slice(1);
    if (!m.inc && !m.out) return reply('Aún no hay ingresos ni gastos apuntados ' + p.label + '.');
    return reply('📊 Rentabilidad ' + p.label + ': **' + eur(m.net) + ' limpios** de ' + eur(m.inc) + ' (te quedas el **' + pct + ' %**)' +
      '\nGastos ' + eur(m.out) + (fuel ? ' · gasolina ' + eur(fuel) + (m.inc ? ' (' + Math.round((fuel / m.inc) * 100) + ' % de lo cobrado)' : '') : '') +
      (km ? '\n' + eur(m.net / km) + ' limpios por km (' + Math.round(km) + ' km)' : '') + (h ? (km ? ' · ' : '\n') + eur(m.net / h) + ' por hora (' + String(Math.round(h * 10) / 10).replace('.', ',') + ' h)' : '') +
      (!km && !h ? '\nApunta tu jornada (km y horas) para saber cuánto ganas por hora y por kilómetro.' : ''),
    label + ' llevas ' + spoken(m.net) + ' limpios, te quedas el ' + pct + ' por ciento de lo que cobras' + (h ? ', a ' + spoken(m.net / h) + ' la hora' : '') + '.');
  }

  // --- Vocabulario aprendido ---
  if (/(que|cuales) (palabras|conceptos)|vocabulario|que has aprendido|que sabes apuntar/.test(t)) {
    const count = new Map();
    for (const m of state.mov || []) if (m.c) count.set(m.c, (count.get(m.c) || 0) + 1);
    const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c]) => c);
    return top.length
      ? reply('📚 Conceptos que he aprendido de ti (los que más usas): ' + top.join(' · ') + '.\nCada concepto nuevo que apuntas lo aprendo; si lo oigo un poco mal, lo corrijo hacia el tuyo.',
        'Los que más usas: ' + top.slice(0, 6).join(', ') + '. Cada concepto nuevo que apuntas lo aprendo.')
      : reply('📚 Aún no he aprendido conceptos tuyos. Cada vez que apuntes algo («…de primera carrera», «…de peaje») lo aprenderé.', 'Aún no he aprendido conceptos tuyos. Cada vez que apuntes algo, lo aprenderé.');
  }

  // --- Ayuda ---
  if (/ayuda|que (puedo|se puede) (preguntar|decir)|que sabes|como funcionas/.test(t)) {
    return reply('🚗 **Conduciendo (manos libres):** di «Oye Rutivo» → te digo «Dime, ¿en qué puedo ayudarte?» → «Apúntame [importe] de [ingreso o gasto] de [concepto], [efectivo o tarjeta]».\nEjemplos: «Apúntame 15 euros de ingreso de primera carrera, efectivo» · «Apúntame 5 euros de gasto de peaje, tarjeta». También de un tirón: «Oye Rutivo, apúntame…». «Borra lo último» lo deshace.\n\nPuedes preguntarme o pedirme cosas como:\n• Hola, ¿qué tal?\n• ¿Qué tiempo hace? / ¿Va a llover mañana?\n• ¿Cuánto llevo hoy?\n• ¿Cuánto gané el mes pasado?\n• ¿Cuánto me debe Charly?\n• ¿Qué tengo mañana?\n• ¿Cuándo llevé a Richard?\n• ¿Cuánto gasto en gasolina?\n• ¿Cuánto IVA pago este trimestre?\n• ¿Cuántos kilómetros llevo este mes?\n• ¿Cómo va mi hucha?\n• Dame el resumen del día\n• ¿Cuántas carreras llevo?\n• ¿Qué he apuntado hoy?\n• Apúntame 12 € en tarjeta\n• Ingrésame 15 con 50 en efectivo\n• Pagué 7 euros de parking\n• He echado 50 de gasoil\n• Mete 5 de propina\n• Borra lo último',
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
    const top = list.length && list.length <= 6
      ? list.map((x) => '• ' + (p.from !== p.to ? fd(x.f) + ' · ' : '') + (x.c || 'Gasto') + ': ' + eur(x.i) + ' · ' + x.p).join('\n')
      : Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => '• ' + k + ': ' + eur(v)).join('\n');
    if (!list.length) return reply('🧾 No hay gastos apuntados ' + p.label + '.', 'No hay gastos apuntados ' + p.label + '.');
    return reply('🧾 Gastos ' + p.label + ': **' + eur(total) + '**' + (top ? '\n' + top : ''), 'Has gastado ' + spoken(total) + ' ' + p.label + (list.length <= 3 ? ': ' + list.map((x) => (x.c || 'gasto') + ', ' + spoken(x.i)).join('; ') : ''));
  }

  // --- Resumen del día (o del periodo) ---
  if (/(resumen|balance|como (ha ido|va) (el dia|hoy|la jornada)|como me ha ido|que tal (el dia|hoy|la jornada|va el dia))/.test(t)) {
    const p = periodOf(t, day, 'hoy');
    const list = state.mov.filter((x) => inRange(x.f, p));
    const m = money(state, p);
    const cash = r2(sum(list.filter((x) => x.t === 'in' && x.p === 'efectivo'), (x) => x.i));
    const card = r2(m.inc - cash);
    const jor = (state.jor || []).filter((j) => inRange(j.f, p));
    const km = r2(sum(jor, (j) => (j.kf > j.ki ? j.kf - j.ki : 0)));
    const h = r2(sum(jor, (j) => hoursOf(j) || 0));
    const label = p.label.charAt(0).toUpperCase() + p.label.slice(1);
    return reply('📋 **Resumen ' + p.label + '**\n💶 Limpio: **' + eur(m.net) + '**\n⬆️ Ingresos: ' + eur(m.inc) + ' (' + m.count + (m.count === 1 ? ' cobro' : ' cobros') + ') · efectivo ' + eur(cash) + ' · tarjeta ' + eur(card) +
      '\n⬇️ Gastos: ' + eur(m.out) + (km ? '\n🛣️ ' + Math.round(km) + ' km' : '') + (h ? ' · ⏱️ ' + String(Math.round(h * 10) / 10).replace('.', ',') + ' h' + (m.net > 0 ? ' · ' + eur(m.net / h) + '/h' : '') : ''),
      label + ' llevas ' + spoken(m.net) + ' limpios, con ' + m.count + (m.count === 1 ? ' cobro' : ' cobros') + '. ' + spoken(cash) + ' en efectivo y ' + spoken(card) + ' con tarjeta. Gastos, ' + spoken(m.out) + '.');
  }

  // --- Cuántas carreras ---
  if (/(cuantas carreras|cuantos servicios|cuantos cobros|cuantos viajes|cuantas he hecho|cuantos he hecho)/.test(t)) {
    const p = periodOf(t, day, 'hoy');
    const m = money(state, p);
    return reply('🚕 ' + p.label.charAt(0).toUpperCase() + p.label.slice(1) + ': **' + m.count + (m.count === 1 ? ' cobro' : ' cobros') + '** por ' + eur(m.inc) + (m.count ? ' (media ' + eur(m.inc / m.count) + ')' : '') + '.',
      p.label + ' llevas ' + m.count + (m.count === 1 ? ' cobro' : ' cobros') + ', por ' + spoken(m.inc));
  }

  // --- Qué he apuntado ---
  if (/(que (he|has|hemos) apuntado|que llevo apuntado|ultimos movimientos|ultimo movimiento|lo ultimo que|que he metido|que hay apuntado|movimientos de hoy)/.test(t)) {
    const p = periodOf(t, day, 'hoy');
    const list = state.mov.filter((x) => inRange(x.f, p)).slice(-8).reverse();
    if (!list.length) return reply('No hay nada apuntado ' + p.label + '.');
    return reply('📝 Apuntado ' + p.label + ':\n' + list.map((x) => (x.t === 'in' ? '⬆️ +' : '⬇️ −') + eur(x.i) + ' · ' + (x.c || '') + ' · ' + x.p).join('\n'),
      'Lo último es ' + (list[0].t === 'in' ? 'un ingreso de ' : 'un gasto de ') + spoken(list[0].i) + (list[0].c ? ', ' + list[0].c : '') + '.');
  }

  // --- Ganancias (lo más habitual) ---
  if (/(cuanto|llevo|gane|ganado|ganar|hecho|hice|facturad|ingres|neto|beneficio|caja|dinero|sacado|saque|cobrado|recaud|como voy|que tal voy|como vamos)/.test(t)) {
    const who = findName(t, [...new Set(state.srv.map((s) => s.cl).filter(Boolean))]);
    const p = periodOf(t, day, /(llevo|hoy|como voy|que tal voy|como vamos)/.test(t) ? 'hoy' : 'mes');
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

// ---------- conversación ----------

/** Quita muletillas: "oye Rutivo, por favor, dime cuánto llevo" → "cuanto llevo". */
export function stripFillers(t) {
  let prev;
  do {
    prev = t;
    t = t.replace(/^(digo|te digo|he dicho|te he dicho|a ver|mira|pues|bueno|entonces|escucha|oye|eh|ey|venga|vale|ok|vamos|y)\s+/, '');
  } while (t !== prev);
  return t
    .replace(/\b(oye|eh|hey|ey|rutivo|por favor|porfa|porfavor|anda|venga|vale)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(me (puedes|podrias)|puedes|podrias|quiero que (me )?|quiero|necesito que (me )?|necesito|me dices|dime|me dirias)\s+/, '')
    .replace(/^que me\s+/, '')
    .replace(/^(me )?(apuntas|anotas|pones|metes|ingresas|sumas|guardas)\b/, (m) => m.replace(/^me /, '').replace(/as$/, 'a').replace(/es$/, 'e'))
    .trim();
}

const GREET = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|que pasa|hey|saludos|holi|que hay)( (que tal|como estas|como va|como vas))?$/;

function hourWord(now) {
  const h = now.getHours();
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** Elige una frase de varias, para no sonar siempre igual. */
const pick = (list, now) => list[(now.getMinutes() * 7 + now.getSeconds()) % list.length];

/** Lo que llevas hoy y tu próximo servicio, en una frase corta. */
function todayLine(state, now) {
  const today = iso(now);
  const net = r2(sum(state.mov.filter((x) => x.f === today), (x) => (x.t === 'in' ? x.i : -x.i)));
  const next = state.srv.filter((s) => serviceTime(s) >= now.getTime()).sort((a, b) => serviceTime(a) - serviceTime(b))[0];
  const nextTxt = next ? (next.f === today ? 'hoy a las ' : next.f === addDays(today, 1) ? 'mañana a las ' : 'el ' + fd(next.f) + ' a las ') + next.h + (next.d ? ' hacia ' + next.d : '') : '';
  return {
    text: 'Hoy llevas **' + eur(net) + '** limpios' + (nextTxt ? ' y tu próximo servicio es ' + nextTxt : '') + '.',
    speech: 'Hoy llevas ' + spoken(net) + ' limpios' + (nextTxt ? ', y tu próximo servicio es ' + nextTxt : '') + '.',
    net,
  };
}

const POSITIVE = /^(bien|muy bien|genial|estupendo|de lujo|fenomenal|todo bien|perfecto|de puta madre|guay|tirando|aqui (andamos|estamos)|bien y tu|bien gracias)( |$)/;
const NEGATIVE = /(^mal|^fatal|^regular|cansad|reventad|agotad|hart[oa]|aburrid|flojo|floja|poco trabajo|no hay trabajo|estresad|hecho polvo|muert[oa])/;
const WEATHER = /(que tiempo|el tiempo|tiempo hace|tiempo va a hacer|tiempo hara|clima|temperatura|grados|llover|lloviendo|lluvia|llueve|paraguas|hace calor|hace frio|hace sol|hace viento|va a hacer (sol|calor|frio|viento))/;

function smallTalk(t, state, now, helpers, ctx = {}) {
  const name = driverName(state.cfg || {});
  const hi = name ? ', ' + name : '';
  const greetWord = /^buenos dias/.test(t) ? 'Buenos días' : /^buenas tardes/.test(t) ? 'Buenas tardes' : /^buenas noches/.test(t) ? 'Buenas noches' : '¡Hola';
  // El tiempo
  if (WEATHER.test(t)) return { kind: 'weather', when: has(t, 'manana') ? 'manana' : 'hoy', rain: /llov|lluvia|llueve|paraguas/.test(t), text: '🌦️ Miro el tiempo…', speech: '' };
  // Saludo: corto y cercano, y pregunta qué tal
  if (GREET.test(t)) {
    if (/^buenas noches/.test(t) && now.getHours() >= 21) {
      const d = todayLine(state, now);
      return { ...reply('🌙 Buenas noches' + hi + '. ' + d.text + ' ¡A descansar, que te lo has ganado!', 'Buenas noches' + hi + '. ' + d.speech + ' A descansar, que te lo has ganado.') };
    }
    const q = pick(['¿Qué tal estás?', '¿Cómo estás?', '¿Qué tal va el día?', '¿Cómo va todo?'], now);
    const g = greetWord === '¡Hola' ? '¡Hola' + hi + '!' : greetWord + hi + '.';
    return { ...reply('👋 ' + g + ' ' + q, g.replace('¡', '') + ' ' + q), ctx: { mood: true } };
  }
  // Te pregunta qué tal: contesta y te lo pregunta a ti
  if (/^(y )?(como estas|que tal estas|como vas|que tal tu|y tu|como te va)( |$)/.test(t) && !ctx.mood) {
    return { ...reply('¡Muy bien, gracias! 😊 ¿Y tú, qué tal' + hi + '?', 'Muy bien, gracias. ¿Y tú, qué tal?'), ctx: { mood: true } };
  }
  if (/^(y tu|y tu que tal|y a ti)( |$)/.test(t)) return reply('¡Yo genial, gracias por preguntar! 😊 Aquí estoy para lo que necesites.', 'Yo genial, gracias por preguntar. Aquí estoy para lo que necesites.');
  // Cómo estás tú (respuesta a la pregunta del saludo)
  if (NEGATIVE.test(t) && (ctx.mood || /^(estoy|ando|vaya|que dia|menudo dia|hoy)/.test(t) || NEGATIVE.test(t.split(' ')[0]))) {
    const d = todayLine(state, now);
    const ok = d.net > 0 ? ' Por lo menos hoy ya llevas **' + eur(d.net) + '** limpios.' : '';
    return reply('Vaya, lo siento' + hi + '. ¡Ánimo! 💪' + ok + ' Descansa cuando puedas. ¿Te ayudo con algo?',
      'Vaya, lo siento. Ánimo.' + (d.net > 0 ? ' Por lo menos hoy ya llevas ' + spoken(d.net) + ' limpios.' : '') + ' Descansa cuando puedas.');
  }
  if (ctx.mood && POSITIVE.test(t)) {
    const d = todayLine(state, now);
    return reply('¡Me alegro mucho! 😊 ' + d.text + ' ¿En qué te ayudo?', 'Me alegro mucho. ' + d.speech + ' ¿En qué te ayudo?');
  }
  if (/^(muchas )?gracias|^genial$|^perfecto$|^de lujo$|^muy bien$|^ok$|^vale$|^estupendo$/.test(t)) return reply(pick(['¡De nada! 😊', '¡A mandar!', '¡Para eso estoy! 😊'], now), '¡De nada!');
  if (/^(adios|hasta luego|chao|nos vemos|hasta manana|me voy)/.test(t)) return reply('¡Hasta luego' + hi + '! Buen servicio 🚕', 'Hasta luego' + hi + '. Buen servicio.');
  if (/(quien eres|como te llamas|que eres)/.test(t)) return reply('Soy **Rutivo**, tu asistente. Me sé tu caja, tus servicios, tu gasolina, tus facturas y tus huchas. Pregúntame o pídeme que apunte algo.', 'Soy Rutivo, tu asistente. Pregúntame lo que quieras de tu trabajo, o pídeme que apunte algo.');
  if (/que hora es/.test(t)) { const h = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); return reply('🕒 Son las **' + h + '**.', 'Son las ' + h); }
  if (/que dia es|a que estamos|que fecha/.test(t)) { const d = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); return reply('📅 Hoy es **' + d + '**.', 'Hoy es ' + d); }
  if (/chiste/.test(t)) return reply('🚕 —Taxista, ¿cuánto me cobra por llevarme al aeropuerto?\n—50 euros.\n—¿Y la maleta?\n—La maleta va gratis.\n—Pues lleve la maleta, que yo voy andando. 😄', 'Un señor le pregunta al taxista cuánto le cobra por ir al aeropuerto. Cincuenta euros. ¿Y la maleta? La maleta va gratis. Pues lleve la maleta, que yo voy andando.');
  if (/(eres (la|el) (mejor|leche|hostia|crack)|te quiero|que lista|que listo)/.test(t)) return reply('¡Jaja, gracias! 😄 Tú sí que eres un crack. ¿Seguimos?', 'Jaja, gracias. Tú sí que eres un crack.');
  return null;
}

// ---------- el tiempo (Open-Meteo, gratis) ----------

const WMO = [[[0], '☀️', 'despejado'], [[1, 2], '🌤️', 'poco nuboso'], [[3], '☁️', 'nublado'], [[45, 48], '🌫️', 'con niebla'], [[51, 53, 55, 56, 57], '🌦️', 'con llovizna'],
  [[61, 63, 65, 66, 67], '🌧️', 'con lluvia'], [[71, 73, 75, 77, 85, 86], '❄️', 'con nieve'], [[80, 81, 82], '🌦️', 'con chubascos'], [[95, 96, 99], '⛈️', 'con tormenta']];
const sky = (code) => WMO.find(([c]) => c.includes(code)) || [[], '🌡️', ''];

/** Texto del tiempo a partir de la respuesta de Open-Meteo. */
export function weatherText(d, when, city, rain = false) {
  const i = when === 'manana' ? 1 : 0;
  const dly = d.daily || {};
  const min = Math.round(dly.temperature_2m_min[i]);
  const max = Math.round(dly.temperature_2m_max[i]);
  const p = dly.precipitation_probability_max ? dly.precipitation_probability_max[i] : null;
  const [, em, word] = sky(dly.weather_code[i]);
  const rainTxt = p === null ? '' : p >= 60 ? 'Va a llover (' + p + ' %) ☂️' : p >= 30 ? 'Puede que llueva (' + p + ' %)' : 'No va a llover';
  if (i === 0 && d.current) {
    const [, emNow, wordNow] = sky(d.current.weather_code);
    const now = Math.round(d.current.temperature_2m);
    const wind = Math.round(d.current.wind_speed_10m);
    const text = emNow + ' En **' + city + '** ahora hace **' + now + ' °C**, ' + wordNow + (wind >= 25 ? ', con viento (' + wind + ' km/h)' : '') + '.\nHoy entre ' + min + ' y ' + max + ' °C. ' + rainTxt + '.';
    const speech = (rain ? rainTxt.replace(/ \(.*\)| ☂️/g, '') + '. ' : '') + 'En ' + city + ' ahora hace ' + now + ' grados, ' + wordNow + '. Hoy entre ' + min + ' y ' + max + ' grados.';
    return { text, speech };
  }
  return {
    text: em + ' Mañana en **' + city + '**: entre **' + min + ' y ' + max + ' °C**, ' + word + '. ' + rainTxt + '.',
    speech: 'Mañana en ' + city + ', entre ' + min + ' y ' + max + ' grados, ' + word + '. ' + rainTxt.replace(/ \(.*\)| ☂️/g, '') + '.',
  };
}

const FOLLOW = /^(y )?(hoy|ayer|anteayer|manana|esta semana|la semana pasada|este mes|el mes pasado|este ano|el ano pasado|este trimestre|el trimestre pasado|(en |el mes de )?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))$/;
const UNDO = /^(deshaz|deshazlo|deshacer|borra(lo)?|quita(lo)?|anula(lo)?|elimina(lo)?|cancela(lo)?)( (lo |el |la )?(ultimo|ultima|eso|lo que (he dicho|has apuntado))( (apunte|ingreso|gasto|cobro|servicio|carrera))?)?$|^me he equivocado$/;
const YES = /^(si|vale|ok|correcto|exacto|eso es|apuntalo|apunta|dale|venga|claro|perfecto|quitalo|borralo|hazlo|adelante|otra vez|si otra vez)( |$)/;
const NO = /^(no|nada|cancela|dejalo|olvidalo|para|mal|incorrecto|no lo apuntes)( |$)/;
/** «No, eran 45», «perdona, con tarjeta», «me he equivocado, era un gasto», «cámbialo a 45» */
const CORRECT = /^(no|perdon|perdona|me he equivocado|me equivoque|error|corrige|corrigelo|cambia|cambialo|rectifica|eran|era|fueron|fue|mejor|en realidad)( |$)/;
const RECENT = 10 * 60e3; // lo apuntado hace menos de 10 min se puede corregir o quitar por voz

/** ¿Corrige lo último que se apuntó? Devuelve los cambios o null. */
function correctionOf(t, done) {
  if (!done || !CORRECT.test(t) || done.items.length !== 1) return null;
  const it = done.items[0];
  const changes = {};
  const said = t.match(/\b(?:eran|era|son|es|fueron|fue|pon|ponlo|ponle|cambialo a|cambia a|a|de)\s+(\d+(?:\.\d{1,2})?)/) || t.match(/(\d+(?:\.\d{1,2})?)/);
  if (said && done.list !== 'huc') changes.i = r2(+said[1]);
  else if (said) changes.i = r2(+said[1]);
  const pay = done.list === 'mov' ? payOf(t.replace(/\bno (en |con )?(efectivo|tarjeta)\b/g, ' ')) : null;
  if (pay && pay !== it.p) changes.p = pay;
  if (done.list === 'mov' && !done.gas) {
    if (/\b(era|es|fue) (un )?gasto\b|\bcomo gasto\b/.test(t) && it.t !== 'out') changes.t = 'out';
    if (/\b(era|es|fue) (un )?ingreso\b|\bcomo ingreso\b/.test(t) && it.t !== 'in') changes.t = 'in';
  }
  if (changes.i === it.i) delete changes.i;
  return Object.keys(changes).length ? changes : null;
}

/** Completa lo que quedó a medias por la forma de pago («¿efectivo o tarjeta?» → «la mitad en cada uno»). */
function fillSlot(t, slot) {
  const base = { ...slot.base };
  const n = amountOf(t);
  const parts = payParts(t, base.i);
  if (parts && parts.error) return reply(parts.error, parts.error, { slot });
  if (parts) {
    const sumParts = r2(sum(parts, (x) => x.i));
    if (Math.abs(sumParts - base.i) > 0.009) base.i = sumParts; // «no, eran 60 en efectivo y 40 con tarjeta»
    return makeAction(base, parts, slot.gas, slot.said, 'Perfecto. ');
  }
  const pay = payOf(t);
  if (n !== null && !pay) return askPay({ ...base, i: r2(n) }, slot.gas, slot.said); // «no, eran 45» → sigue faltando cómo
  if (!pay) return null;
  if (n !== null) base.i = r2(n);
  return makeAction(base, [{ p: pay, i: base.i }], slot.gas, slot.said, 'Perfecto. ');
}

/**
 * Responde a lo que dice el usuario. `ctx` guarda el hilo de la conversación
 * (para «¿y ayer?» o completar «apunta una carrera» → «de 30»). Devuelve:
 *  {kind:'answer', text, speech, ctx} · {kind:'action', action, text, speech, ctx} · {kind:'undo', ctx}
 */
export function ask(input, state, now = new Date(), helpers = {}, ctx = {}) {
  let t = stripFillers(normalize(input));
  // Solo «Oye Rutivo»: contesta como al llamarle desde la pantalla principal
  if (!t && /\b(rutivo|rutibo|ruti|rutivos)\b/.test(normalize(input))) return { ...reply('👂 Dime, ¿en qué puedo ayudarte?', 'Dime, ¿en qué puedo ayudarte?'), ctx };
  if (!t) return { ...reply('Te escucho. Pregúntame, por ejemplo: «¿Cuánto llevo hoy?»'), ctx };
  let hello = '';
  // "Hola, apunta 50 euros": saludar y seguir con la orden
  const g = GREET.test(t) ? null : t.match(/^(buenos dias|buenas tardes|buenas noches|hola|buenas)\s+(.{6,})$/);
  if (g) { hello = '¡Hola! '; t = stripFillers(g[2]); }
  const done = ctx.done && now.getTime() - (ctx.done.at || 0) < RECENT ? ctx.done : null;
  // Respuesta a «¿Lo apunto?» / «¿Lo quito?»
  if (ctx.confirm) {
    if (YES.test(t)) {
      if (ctx.confirm.undo) return { kind: 'undo', text: '', speech: '', ctx: {} };
      return { kind: 'action', action: ctx.confirm.action, text: ctx.confirm.text, speech: ctx.confirm.speech, ctx: {} };
    }
    if (NO.test(t)) {
      return ctx.confirm.undo
        ? { ...reply('Vale, lo dejo como está.', 'Vale, lo dejo como está.'), ctx: {} }
        : { ...reply('Vale, no lo apunto. Dímelo otra vez cuando quieras.', 'Vale, no lo apunto.'), ctx: {} };
    }
  }
  // Respuesta a «¿En efectivo o con tarjeta?»
  if (ctx.slot && !WRITE_VERB.test(t) && !WRITE_PHRASE.test(t)) { // una orden nueva sustituye a la que quedó a medias
    if (NO.test(t) && !payOf(t) && amountOf(t) === null) return { ...reply('Vale, no lo apunto.', 'Vale, no lo apunto.'), ctx: {} };
    const r = fillSlot(t, ctx.slot);
    if (r) return finish(r, t, helpers, ctx, done, true);
  }
  // Corregir lo último: «no, eran 45», «perdona, con tarjeta»
  const fix = correctionOf(t, done);
  if (fix) {
    const it = { ...done.items[0], ...fix };
    const what = done.list === 'huc' ? eur(it.i) + ' en la hucha' : kindWord(it) + ' de ' + eur(it.i) + ' ' + payWords(it.p) + (it.c ? ' (' + it.c + ')' : '');
    return { kind: 'amend', changes: fix, text: '✏️ Corregido: ahora es ' + what + '.', speech: 'Corregido. Ahora es ' + (done.list === 'huc' ? spoken(it.i) + ' en la hucha' : kindWord(it) + ' de ' + spoken(it.i) + ' ' + payWords(it.p)) + '.', ctx: {} };
  }
  // Quitar lo último: siempre preguntando antes
  if (UNDO.test(t)) {
    if (!done) return { ...reply('No hay nada reciente que quitar. Para borrar algo más antiguo, hazlo en su pantalla.', 'No hay nada reciente que quitar.'), ctx: {} };
    const what = describeDone(done);
    return { kind: 'confirm', text: '🗑️ ¿Quito ' + what + '?', speech: '¿Quito ' + what.replace(/\s*\(.*\)/, '').replace(/(\d+),(\d+)\s€/g, (m, e, c) => spoken(+e + c / 100)) + '?', ctx: { confirm: { undo: true } } };
  }
  const w = worthIntent(t);
  if (w) return { ...w, ctx: {} };
  if (LEAVE.test(t)) return { kind: 'leave', text: '', speech: '', ctx: {} };
  const chat = smallTalk(t, state, now, helpers, ctx);
  if (chat) return { ...chat, ctx: chat.ctx || {} };
  // Completar algo que quedó a medias o seguir con la última pregunta
  if (ctx.pending && amountOf(t) !== null && !QUESTION.test(t)) t = ctx.pending + ' ' + t;
  else if (ctx.last && FOLLOW.test(t)) t = ctx.last.replace(/\b(hoy|ayer|anteayer|esta semana|la semana pasada|este mes|el mes pasado|este ano|el ano pasado|este trimestre|el trimestre pasado|(en )?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))\b/g, '').trim() + ' ' + t.replace(/^y /, '');
  const r = answer(t, state, now, { ...helpers, original: input });
  if (hello) { r.text = hello + r.text; r.speech = 'Hola. ' + r.speech; }
  return finish(r, t, helpers, ctx, done, false);
}

/** Últimos pasos: preguntar si hay dudas o si se repite lo mismo, y el hilo para la siguiente frase. */
function finish(r, t, helpers, ctx, done, answered) {
  if (r.kind === 'action') {
    const a = r.action;
    const items = a.items || [a.item];
    // ¿Lo mismo que se acaba de apuntar? (orden repetida, o el micro la oyó dos veces)
    if (done && done.list === a.list && sig(done.items) === sig(items) && Date.now() - done.at < 3 * 60e3 && !helpers.noConfirm) {
      const what = a.list === 'huc' ? eur(items[0].i) + ' en la hucha' : partsText(items);
      return { kind: 'confirm', text: '🔁 Eso ya lo apunté hace un momento (' + what + '). ¿Lo apunto **otra vez**?', speech: 'Eso ya lo he apuntado hace un momento. ¿Lo apunto otra vez?',
        ctx: { confirm: { action: a, text: r.text, speech: r.speech } } };
    }
    // Con ruido: si el móvil no estaba seguro o la frase llegó muy larga, preguntar antes de apuntar
    const doubtful = !answered && ((helpers.confidence > 0 && helpers.confidence < 0.55) || t.split(' ').length > 14);
    if (doubtful && !helpers.noConfirm) {
      const it = a.item;
      const what = a.list === 'huc' ? eur(it.i) + ' en la hucha' : items.length > 1 ? eur(sum(items, (x) => x.i)) + (it.t === 'out' ? ' de gasto (' : ' (') + it.c + '): ' + partsText(items)
        : eur(it.i) + (it.t === 'out' ? ' de gasto (' + it.c + ')' : ' (' + it.c + ')') + (it.p === 'tarjeta' ? ' con tarjeta' : ' en efectivo');
      return { kind: 'confirm', text: '🤔 ¿Apunto **' + what + '**?', speech: '¿Apunto ' + spoken(a.list === 'huc' ? it.i : sum(items, (x) => x.i)) + (a.list === 'huc' ? ' en la hucha' : items.length > 1 ? ', ' + partsText(items, true) : it.p === 'tarjeta' ? ' con tarjeta' : ' en efectivo') + '?',
        ctx: { confirm: { action: a, text: r.text, speech: r.speech } } };
    }
  }
  const next = {};
  if (r.slot) next.slot = r.slot;
  else if (r.pending) next.pending = r.pending;
  else if (r.kind === 'answer' && !/No te he entendido/.test(r.text)) next.last = t;
  const { slot, ...out } = r;
  return { ...out, ctx: next };
}

