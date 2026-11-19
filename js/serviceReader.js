// Lector flexible de servicios: entiende el texto de cualquier app o agencia
// (pegado o leído de una foto/captura), en español o inglés. Función pura.
import { parseAgencyService } from './agency.js';
import { titleCase } from './utils.js';

const strip = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Etiquetas que usan las distintas apps (sin tildes, en minúsculas)
const LABELS = {
  date: ['fecha de servicio', 'fecha recogida', 'fecha de recogida', 'pickup date', 'pick-up date', 'service date', 'arrival date', 'fecha', 'date', 'dia', 'day'],
  time: ['hora de recogida', 'hora recogida', 'pickup time', 'pick-up time', 'pick up time', 'hora', 'time'],
  passenger: ['lead passenger', 'passenger name', 'nombre del pasajero', 'nombre pasajero', 'pax name', 'pasajero', 'passenger', 'cliente final', 'titular', 'nombre', 'name', 'guest'],
  flight: ['numero de vuelo', 'nº vuelo', 'n vuelo', 'flight number', 'flight no', 'flight nº', 'vuelo', 'flight'],
  origin: ['lugar de recogida', 'punto de recogida', 'pickup location', 'pick-up location', 'pick up', 'pickup', 'pick-up', 'recogida', 'origen', 'desde', 'from'],
  destination: ['direccion de destino', 'lugar de destino', 'drop-off location', 'dropoff location', 'drop off', 'dropoff', 'drop-off', 'destino', 'destination', 'hasta', 'to'],
  amount: ['importe a cobrar al cliente', 'importe a cobrar', 'a cobrar', 'importe', 'precio', 'price', 'total', 'amount', 'tarifa', 'fare', 'pvp', 'cobrar'],
  phone: ['telefono', 'phone', 'tel', 'movil', 'mobile', 'whatsapp', 'contacto'],
  pax: ['numero de pasajeros', 'passengers', 'pasajeros', 'pax', 'adults', 'adultos', 'personas'],
  code: ['codigo servicio', 'codigo de reserva', 'localizador', 'referencia', 'booking ref', 'booking', 'reserva', 'codigo', 'ref', 'id'],
};

const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** Valor de una etiqueta: en la misma línea ("Fecha: 20/11") o en la siguiente (captura de app). */
function labelValue(lines, names) {
  for (let i = 0; i < lines.length; i++) {
    const l = strip(lines[i]).toLowerCase().trim();
    for (const n of names) {
      const m = l.match(new RegExp('^[^a-z0-9]*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*([:\\-–=]?)\\s*(.*)$'));
      if (!m) continue;
      const rest = lines[i].trim().slice(lines[i].trim().length - m[2].length).trim();
      // "Pick-up date" no es el valor de "Pick-up": es otra etiqueta
      if (!m[1] && /^(date|time|location|point|number|no|name|ref|fecha|hora|lugar|punto|numero|nombre)\b/.test(m[2])) continue;
      if (rest) return rest;
      const next = lines.slice(i + 1).find((x) => x.trim());
      if (next) return next.trim();
    }
  }
  return '';
}

/** Fecha en cualquier formato habitual → "AAAA-MM-DD" (sin año: el próximo que toque). */
export function findDate(text, today) {
  const t = strip(text).toLowerCase();
  const year = +today.slice(0, 4);
  const fix = (y, m, d) => {
    let yy = y ? (+y < 100 ? 2000 + +y : +y) : year;
    if (!y && yy + '-' + pad(m) + '-' + pad(d) < today.slice(0, 7) + '-01') yy++;
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? yy + '-' + pad(m) + '-' + pad(d) : '';
  };
  let m = t.match(/\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return fix(m[1], +m[2], +m[3]);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m && !/\d:\d/.test(m[0])) { const r = fix(m[3], +m[2], +m[1]); if (r) return r; }
  m = t.match(/\b(\d{1,2})(?:\s+de)?\s+(ene|feb|mar|abr|apr|may|jun|jul|ago|aug|sep|set|oct|nov|dic|dec)[a-z]*\.?(?:\s+(?:de\s+)?(\d{4}))?/);
  if (m) return fix(m[3], MONTHS[m[2]], +m[1]);
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?/);
  if (m) return fix(m[3], MONTHS[m[1]], +m[2]);
  if (/\bmanana\b|\btomorrow\b/.test(t)) { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (/\bhoy\b|\btoday\b/.test(t)) return today;
  return '';
}

const findTime = (s) => { const m = String(s).match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/); return m ? pad(m[1]) + ':' + m[2] : ''; };

function findAmount(s) {
  const t = String(s).replace(/\s/g, ' ');
  const m = t.match(/(?:€|eur|euros?)\s*(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?)/i) || t.match(/^\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*$/);
  if (!m) return 0;
  return parseFloat((m[1] || m[2]).replace(',', '.')) || 0;
}

const findFlight = (s) => {
  const m = String(s).toUpperCase().match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4}[A-Z]?)\b/);
  return m && !/^(KM|EU|ES|CP|AM|PM|TO|ID|NO)$/.test(m[1]) ? m[1] + m[2] : '';
};

const findPhone = (s) => (String(s).match(/(?:\+|00)\d[\d\s().-]{7,}\d/) || [''])[0].replace(/[().-]/g, ' ').replace(/\s+/g, ' ').trim();

const cleanName = (s) => titleCase(String(s).replace(/[*_/|]+/g, ' ').replace(/\b(mr|mrs|ms|miss|dr|sr|sra|srta)\.?\s+/gi, (m) => m).replace(/\s+/g, ' ').trim());

/** Ruta en una línea: "Aeropuerto de Málaga → Marbella", "AGP - Hotel X", "From A to B". */
function findRoute(lines) {
  for (const l of lines) {
    const m = l.match(/^\s*(?:from|desde|de)?\s*(.{3,60}?)\s*(?:→|->|=>|➜|➔|>| to | hasta | a )\s*(.{3,60})$/i);
    if (m && !/\d{1,2}:\d{2}/.test(l)) return [m[1].trim(), m[2].trim()];
  }
  return ['', ''];
}

/** Lugar limpio, con mayúsculas normales pero dejando los códigos de aeropuerto (AGP) en mayúsculas. */
function placeOf(s) {
  const src = String(s).replace(/\s*[-–]\s*[A-Z]{3}$/, '').replace(/\s+/g, ' ').trim();
  const mixed = /[a-z]/.test(src);
  return titleCase(src)
    .replace(/\(([a-z]{3})\)/gi, (m, c) => '(' + c.toUpperCase() + ')')
    .replace(/\b([A-Za-z]{3})\b/g, (m, c) => (mixed && new RegExp('\\b' + c.toUpperCase() + '\\b').test(src) ? c.toUpperCase() : m));
}

/**
 * Lee un servicio de cualquier texto. Devuelve los datos encontrados (lo que
 * falte, vacío) o null si no hay ni fecha ni hora: no parece un servicio.
 */
export function readService(text, today) {
  const raw = String(text || '').replace(/\r/g, '');
  const strict = parseAgencyService(raw);
  if (strict && strict.date && !/NaN|--/.test(strict.date)) return strict; // formato de siempre
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const get = (k) => labelValue(lines, LABELS[k]);

  const date = findDate(get('date'), today) || findDate(raw, today);
  const time = findTime(get('time')) || findTime(raw);
  if (!date && !time) return null;
  let origin = get('origin');
  let destination = get('destination');
  if (!origin || !destination) {
    const [a, b] = findRoute(lines);
    origin = origin || a;
    destination = destination || b;
  }
  const passenger = cleanName(get('passenger')) || cleanName((raw.match(/\b(?:mr|mrs|ms|miss)\.?\s+([A-Za-zÀ-ÿ'-]+(?:\s+[A-Za-zÀ-ÿ'-]+){0,2})/i) || [])[1] || '');
  const code = get('code');
  const pax = (get('pax').match(/\d+/) || [''])[0];
  return {
    date: date || today,
    time,
    origin: placeOf(origin),
    destination: placeOf(destination),
    amount: findAmount(get('amount')) || findAmount(raw),
    notes: [code && 'Ref. ' + code.replace(/^[:#\s]+/, ''), pax && pax + ' pax'].filter(Boolean).join(' · '),
    passenger,
    flight: findFlight(get('flight')) || findFlight(raw.replace(/\b\d{1,2}[:.]\d{2}\b/g, ' ')),
    phone: findPhone(get('phone')) || findPhone(raw),
  };
}
