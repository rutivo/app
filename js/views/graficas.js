// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Gráficas sencillas en la Caja. Barras finas, un solo eje, sin librerías (todo
// en el móvil). Al tocar una barra se ve su dato; cada gráfica se puede ver en tabla.
// Los textos van ya en los dos idiomas (la tarjeta no pasa por el traductor de pantalla).
import { $ } from '../dom.js';
import { expenseCategories, monthly, weekdays, weekly } from '../graficas.js';
import { isEn } from '../i18n.js';
import { S } from '../store.js';
import { esc, eur, today } from '../utils.js';

let mode = 'sem'; // 'sem' (semanas) | 'mes' (meses)
let picked = null; // barra elegida en la gráfica principal

const L = (es, en) => (isEn() ? en : es);
const eur0 = (v) => eur(v).replace(/,00(?=\s?€)/, '');
const MON_EN = { ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };
const DAY_EN = { Lunes: 'Monday', Martes: 'Tuesday', Miércoles: 'Wednesday', Jueves: 'Thursday', Viernes: 'Friday', Sábado: 'Saturday', Domingo: 'Sunday' };
const mon = (s) => (isEn() ? s.replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/gi, (m) => MON_EN[m.toLowerCase()]) : s);

/** Etiquetas en el idioma de la app. */
function labelled(rows) {
  return rows.map((r) => ({
    ...r,
    label: mon(r.label),
    long: isEn() ? mon(r.long.replace(/^Semana del /, 'Week of ')) : r.long,
  }));
}
const dayName = (n) => (isEn() ? DAY_EN[n] : n);

/** Barras verticales con su línea de cero (admite negativos: semanas con más gastos que ingresos). */
function bars(rows, value, sel, kind) {
  const vals = rows.map(value);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const range = max - min || 1;
  const zero = (max / range) * 100; // % desde arriba donde está el cero
  const best = vals.indexOf(Math.max(...vals));
  return '<div class="ch">' +
    '<div class="ch-plot">' +
    rows.map((r, i) => {
      const v = vals[i];
      const h = (Math.abs(v) / range) * 100;
      const neg = v < 0;
      const style = neg ? 'top:' + zero.toFixed(1) + '%;height:' + h.toFixed(1) + '%' : 'bottom:' + (100 - zero).toFixed(1) + '%;height:' + h.toFixed(1) + '%';
      return '<button type="button" class="ch-col' + (i === sel ? ' on' : '') + '" data-ch="' + kind + '" data-i="' + i + '" aria-label="' + esc(r.long) + ': ' + eur0(v) + '">' +
        (i === best && v > 0 ? '<span class="ch-top" style="bottom:calc(' + (100 - zero + h).toFixed(1) + '% + 2px)">' + eur0(v) + '</span>' : '') +
        '<i class="ch-z" style="top:' + zero.toFixed(1) + '%"></i><i class="ch-bar' + (neg ? ' neg' : '') + (r.partial ? ' part' : '') + '" style="' + style + '"></i></button>';
    }).join('') +
    '</div><div class="ch-x" aria-hidden="true">' + rows.map((r) => '<span>' + esc(r.label) + '</span>').join('') + '</div></div>';
}

function table(head, rows) {
  return '<details class="ch-tab"><summary>' + L('Ver en tabla', 'Show as table') + '</summary><table><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></details>';
}

const dayRead = (w) => '<b>' + dayName(w.name) + ':</b> ' + eur(w.avg) + L(' limpios de media (', ' net on average (') + w.worked +
  L(w.worked === 1 ? ' día trabajado' : ' días trabajados', w.worked === 1 ? ' day worked' : ' days worked') + ').';

export function renderCharts() {
  const box = $('#graf');
  if (!box) return;
  box.setAttribute('translate', 'no');
  const day = today();
  const mov = S.mov;
  const title = '<h3 class="mt0">📊 ' + L('Gráficas', 'Charts') + '</h3>';
  if (!mov.length) {
    box.innerHTML = title + '<div class="mut">' + L('Cuando apuntes ingresos y gastos en la caja, aquí verás cuánto te queda limpio cada semana, en qué gastas más y qué días rindes más.',
      'When you record income and expenses, you’ll see here your net each week, where your money goes and which days pay best.') + '</div>';
    return;
  }
  const rows = labelled(mode === 'sem' ? weekly(mov, day, 8) : monthly(mov, day, 6));
  const sel = picked !== null && picked < rows.length ? picked : rows.length - 1;
  const r = rows[sel];

  const cats = expenseCategories(mov, day.slice(0, 7) + '-01', day, 5);
  const catMax = Math.max(1, ...cats.items.map((c) => c.total));

  const wd = weekdays(mov, day, 90).map((w) => ({ ...w, label: isEn() ? DAY_EN[w.name].charAt(0) : w.label, long: dayName(w.name) }));
  const worked = wd.filter((w) => w.worked);
  const bestDay = worked.length ? worked.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;

  box.innerHTML =
    title +
    // --- Limpio por semana / mes ---
    '<div class="ch-head"><b>' + L('Lo que te queda limpio', 'Your net (after expenses)') + '</b><span class="seg ch-seg">' +
      '<button type="button" data-chm="sem" class="' + (mode === 'sem' ? 'on' : '') + '" aria-pressed="' + (mode === 'sem') + '">' + L('Semanas', 'Weeks') + '</button>' +
      '<button type="button" data-chm="mes" class="' + (mode === 'mes' ? 'on' : '') + '" aria-pressed="' + (mode === 'mes') + '">' + L('Meses', 'Months') + '</button></span></div>' +
    '<div class="ch-read" aria-live="polite"><b>' + esc(r.long) + (r.partial ? L(' (en curso)', ' (so far)') + '' : '') + ':</b> ' + eur(r.net) + L(' limpios', ' net') +
      ' · <span class="in">' + eur(r.inc) + '</span>' + L(' ingresos', ' income') + ' · <span class="out">' + eur(r.out) + '</span>' + L(' gastos', ' expenses') + '</div>' +
    bars(rows, (x) => x.net, sel, 'net') +
    '<div class="mut ch-note">' + L('Toca una barra para ver su dato. La última (más clara) es ' + (mode === 'sem' ? 'esta semana' : 'este mes') + ', aún sin terminar.',
      'Tap a bar to see its figures. The last one (lighter) is ' + (mode === 'sem' ? 'this week' : 'this month') + ', still in progress.') + '</div>' +
    table([mode === 'sem' ? L('Semana', 'Week') : L('Mes', 'Month'), L('Ingresos', 'Income'), L('Gastos', 'Expenses'), L('Limpio', 'Net')],
      rows.map((x) => [esc(x.long), eur(x.inc), eur(x.out), '<b>' + eur(x.net) + '</b>'])) +
    // --- En qué gastas más ---
    '<div class="ch-head mt14"><b>' + L('En qué gastas más este mes', 'Where your money goes this month') + '</b></div>' +
    (cats.items.length
      ? '<div class="ch-h">' + cats.items.map((c) => '<div class="ch-hr"><span class="ch-hn">' + esc(c.name === 'Otros' ? L('Otros', 'Other') : c.name) + '</span><span class="ch-ht"><i style="width:' +
          Math.max(2, (c.total / catMax) * 100).toFixed(1) + '%"></i></span><b>' + eur0(c.total) + '</b></div>').join('') + '</div>' +
        '<div class="mut ch-note">' + L('Total de gastos del mes: ', 'Total expenses this month: ') + eur(cats.total) + '.</div>'
      : '<div class="mut ch-note">' + L('Este mes aún no has apuntado gastos.', 'No expenses recorded this month yet.') + '</div>') +
    // --- Qué días rindes más ---
    '<div class="ch-head mt14"><b>' + L('Qué días rindes más', 'Which days pay best') + '</b></div>' +
    (worked.length
      ? '<div class="ch-read" aria-live="polite">' + (bestDay && bestDay.avg > 0
        ? L('Tu mejor día: <b>' + bestDay.name.toLowerCase() + '</b>, ' + eur(bestDay.avg) + ' limpios de media.', 'Your best day: <b>' + DAY_EN[bestDay.name] + '</b>, ' + eur(bestDay.avg) + ' net on average.')
        : L('Aún no hay días con beneficio.', 'No profitable days yet.')) + '</div>' +
        bars(wd, (w) => w.avg, -1, 'dia') +
        '<div class="mut ch-note">' + L('Media de lo limpio en los días que trabajaste, últimos 3 meses.', 'Average net on the days you worked, last 3 months.') + '</div>' +
        table([L('Día', 'Day'), L('Días trabajados', 'Days worked'), L('Media limpia', 'Average net')], wd.map((w) => [dayName(w.name), w.worked, eur(w.avg)]))
      : '<div class="mut ch-note">' + L('Aún no hay suficientes días apuntados.', 'Not enough days recorded yet.') + '</div>');
}

export function initCharts() {
  const box = $('#graf');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const m = e.target.closest('[data-chm]');
    if (m) { mode = m.dataset.chm; picked = null; renderCharts(); return; }
    const b = e.target.closest('.ch-col[data-ch="net"]');
    if (b) { picked = +b.dataset.i; renderCharts(); return; }
    const d = e.target.closest('.ch-col[data-ch="dia"]');
    if (d) {
      const w = weekdays(S.mov, today(), 90)[+d.dataset.i];
      const read = d.closest('.ch').previousElementSibling;
      if (read) read.innerHTML = dayRead(w);
      box.querySelectorAll('.ch-col[data-ch="dia"]').forEach((x) => x.classList.toggle('on', x === d));
    }
  });
}
