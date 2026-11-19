// Periodos para juntar las facturas de gasolina en un solo PDF (sin dependencias del navegador).
import { r2, sum } from './utils.js';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
const range = (y1, m1, y2, m2) => ({ from: y1 + '-' + pad(m1) + '-01', to: y2 + '-' + pad(m2) + '-' + pad(lastDay(y2, m2)) });

export const PERIODS = [
  ['mes', 'Este mes'],
  ['mesAnt', 'Mes pasado'],
  ['tri', 'Este trimestre'],
  ['triAnt', 'Trimestre pasado'],
  ['anio', 'Este año'],
  ['todo', 'Todas'],
];

/** Fechas {from, to} ("AAAA-MM-DD") del periodo `kind` contado desde el día `day`. */
export function periodRange(kind, day) {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7);
  const q = Math.ceil(m / 3);
  if (kind === 'mes') return range(y, m, y, m);
  if (kind === 'mesAnt') return m === 1 ? range(y - 1, 12, y - 1, 12) : range(y, m - 1, y, m - 1);
  if (kind === 'tri') return range(y, q * 3 - 2, y, q * 3);
  if (kind === 'triAnt') return q === 1 ? range(y - 1, 10, y - 1, 12) : range(y, q * 3 - 5, y, q * 3 - 3);
  if (kind === 'anio') return range(y, 1, y, 12);
  return { from: '0000-01-01', to: '9999-12-31' };
}

/** Facturas de gasolina entre dos fechas (incluidas), de la más antigua a la más nueva, con totales. */
export function fuelBetween(gas, from, to) {
  const list = gas.filter((g) => g.f >= from && g.f <= to).sort((a, b) => a.f.localeCompare(b.f) || String(a.id).localeCompare(String(b.id)));
  return {
    list,
    total: r2(sum(list, (g) => g.i)),
    liters: r2(sum(list, (g) => g.l || 0)),
    withPhoto: list.filter((g) => g.ph).length,
  };
}

/** Nombre del archivo: "Gasolina-2026-T4.pdf", "Gasolina-2026-11.pdf", "Gasolina-2026.pdf"… */
export function packName(kind, day, from, to) {
  if (kind === 'tri' || kind === 'triAnt') return 'Gasolina-' + from.slice(0, 4) + '-T' + Math.ceil(+from.slice(5, 7) / 3) + '.pdf';
  if (kind === 'mes' || kind === 'mesAnt') return 'Gasolina-' + from.slice(0, 7) + '.pdf';
  if (kind === 'anio') return 'Gasolina-' + from.slice(0, 4) + '.pdf';
  if (kind === 'todo') return 'Gasolina-todas-' + day + '.pdf';
  return 'Gasolina-' + from + '_' + to + '.pdf';
}
