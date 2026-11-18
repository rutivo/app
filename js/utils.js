// Utilidades sin dependencias del DOM (se pueden probar en Node).

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Formatea un importe en euros. */
export const eur = (n) => EUR.format(n || 0);

/** Redondea a céntimos. */
export const r2 = (n) => Math.round(n * 100) / 100;

/** Fecha local de hoy como "AAAA-MM-DD". */
export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/** Escapa texto para insertarlo en HTML. */
export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** "AAAA-MM-DD" → "DD/MM/AAAA". */
export const fd = (d) => d.split('-').reverse().join('/');

/** "AAAA-MM-DD" → "DD/MM". */
export const dm = (d) => d.slice(8) + '/' + d.slice(5, 7);

/** Identificador corto y único. */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Primera letra en mayúscula. */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cada palabra con mayúscula inicial ("JUAN PÉREZ" → "Juan Pérez"). */
export const titleCase = (t) => t.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

/** Quita acentos y deja un nombre de archivo seguro. */
export const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Suma una propiedad numérica de una lista. */
export const sum = (list, get) => list.reduce((acc, x) => acc + get(x), 0);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "AAAA-MM" → "Marzo 2026". */
export const monthName = (m) => cap(MONTHS[+m.slice(5) - 1]) + ' ' + m.slice(0, 4);

/** "AAAA-MM-DD" → "AAAA-T1".."AAAA-T4". */
export const quarterOf = (d) => d.slice(0, 4) + '-T' + Math.ceil(+d.slice(5, 7) / 3);
