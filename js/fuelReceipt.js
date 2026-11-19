// Lectura del texto de un ticket de gasolina (salida del OCR). Función pura.

const BRANDS = ['REPSOL', 'CEPSA', 'MOEVE', 'BP', 'SHELL', 'GALP', 'PETRONOR', 'PLENOIL', 'BALLENOIL', 'CARREFOUR', 'ALCAMPO',
  'ESSO', 'AVIA', 'DISA', 'PETROPRIX', 'GASEXPRESS', 'EROSKI', 'Q8', 'CAMPSA', 'MEROIL', 'TAMOIL'];

/** "1.234,56" / "45,30" / "45.30" → número. */
function num(str) {
  let s = str.replace(/\s/g, '');
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const NUMBER = '(\\d{1,4}(?:[.\\s]\\d{3})*[.,]\\d{2})';

export function parseFuelReceipt(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const up = lines.map((l) => l.toUpperCase());

  // Importe: línea de total; si no, el mayor importe con €.
  let amount = null;
  for (const l of up) {
    if (/SUBTOTAL|BASE|IVA|I\.V\.A|CAMBIO|ENTREGAD/.test(l)) continue;
    const m = l.match(new RegExp('(?:TOTAL|IMPORTE|A PAGAR|PAGADO)\\D{0,15}' + NUMBER));
    if (m) { amount = num(m[1]); break; }
  }
  if (amount === null) {
    const all = [...String(text).matchAll(new RegExp(NUMBER + '\\s*(?:€|EUR)', 'gi'))].map((m) => num(m[1])).filter(Boolean);
    if (all.length) amount = Math.max(...all);
  }

  // Litros
  let liters = null;
  for (const l of up) {
    const m = l.match(new RegExp(NUMBER + '\\s*(?:L\\b|LTS?\\b|LITROS)')) || l.match(new RegExp('(?:LITROS|LTS?|VOLUMEN|CANTIDAD)\\D{0,12}' + NUMBER));
    if (m) { liters = num(m[1]); break; }
  }

  // Gasolinera
  const brandLine = up.find((l) => BRANDS.some((b) => new RegExp('\\b' + b + '\\b').test(l)));
  const station = brandLine ? BRANDS.find((b) => new RegExp('\\b' + b + '\\b').test(brandLine)) : '';

  // Fecha
  let date = '';
  const dm = String(text).match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (dm) {
    const y = dm[3].length === 2 ? '20' + dm[3] : dm[3];
    const mo = +dm[2];
    const d = +dm[1];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) date = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  return { amount, liters, station: station ? station.charAt(0) + station.slice(1).toLowerCase() : '', date };
}
