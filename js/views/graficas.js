// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel de estadísticas de la Caja: cifras clave, evolución (semanas, meses o
// años) con la comparación con el periodo anterior, evolución de los gastos,
// gastos por categoría (con sus apuntes y tickets) y qué días rindes más.
// Todo con los datos que la app ya tiene en el móvil: sin consultas a Firebase.
// Sin librerías. Los textos van en los dos idiomas (la tarjeta no pasa por el
// traductor de pantalla).
import { $ } from '../dom.js';
import { cleanMovements, evolution, expenseBreakdown, productivity, summary } from '../graficas.js';
import { isEn } from '../i18n.js';
import { S } from '../store.js';
import { esc, eur, fd, today } from '../utils.js';
import { showReceipt } from './gasolina.js';

let unit = 'mes'; // 'sem' | 'mes' | 'ano'
let picked = null; // periodo elegido (índice); null = el último
let openCat = null; // categoría de gasto desplegada

const L = (es, en) => (isEn() ? en : es);
const eur0 = (v) => eur(v).replace(/,00(?=\s?€)/, '');
const MON_EN = { ene: 'Jan', feb: 'Feb', mar: 'Mar', abr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dic: 'Dec' };
const MONL_EN = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December' };
const DAY_EN = { Lunes: 'Monday', Martes: 'Tuesday', Miércoles: 'Wednesday', Jueves: 'Thursday', Viernes: 'Friday', Sábado: 'Saturday', Domingo: 'Sunday' };
const CAT_EN = { gasolina: 'Fuel', peajes: 'Tolls', mantenimiento: 'Maintenance', seguros: 'Insurance', gestoria: 'Accountant', lavados: 'Car wash', otros: 'Other expenses' };
const tx = (s) => (isEn()
  ? String(s).replace(/^Semana del /, 'Week of ').replace(/ al /, ' – ').replace(/ de (\d{4})$/, ' $1').replace(/^Año /, 'Year ')
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi, (m) => MONL_EN[m.toLowerCase()] || m)
    .replace(/\b(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\b/g, (m) => MONL_EN[m.toLowerCase()])
    .replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/g, (m) => MON_EN[m])
  : s);
const dayName = (n) => (isEn() ? DAY_EN[n] : n);
const catName = (c) => (isEn() ? CAT_EN[c.id] : c.name);

/** ▲ 12 % / ▼ 8 % (con icono y texto, nunca solo el color). */
function badge(change, prevLabel) {
  if (change === null || change === undefined) return '<span class="kp-badge flat" title="' + esc(prevLabel || '') + '">' + L('sin dato anterior', 'no previous data') + '</span>';
  const up = change >= 0;
  return '<span class="kp-badge ' + (up ? 'up' : 'down') + '" title="' + esc(prevLabel || '') + '">' + (up ? '▲ +' : '▼ ') + change + ' %</span>';
}

/** Barras verticales: línea de cero, la elegida resaltada con su dato encima, la de «en curso» rayada. */
function bars(rows, value, sel, kind, cls = '') {
  const vals = rows.map(value);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const range = max - min || 1;
  const zero = (max / range) * 100;
  return '<div class="ch ' + cls + '"><div class="ch-plot">' +
    rows.map((r, i) => {
      const v = vals[i];
      const h = (Math.abs(v) / range) * 100;
      const neg = v < 0;
      const style = (neg ? 'top:' + zero.toFixed(2) : 'bottom:' + (100 - zero).toFixed(2)) + '%;height:' + h.toFixed(2) + '%;--d:' + (i * 35) + 'ms';
      const tip = i === sel
        ? '<span class="ch-tip" style="' + (neg ? 'top:calc(' + (zero + h).toFixed(2) + '% + 4px)' : 'bottom:calc(' + (100 - zero + h).toFixed(2) + '% + 4px)') + '">' + eur0(v) + '</span>'
        : '';
      return '<button type="button" class="ch-col' + (i === sel ? ' on' : '') + '" data-ch="' + kind + '" data-i="' + i + '" aria-pressed="' + (i === sel) + '" aria-label="' +
        esc(tx(r.long) + (r.partial ? L(' (en curso)', ' (in progress)') : '') + ': ' + eur0(v)) + '">' + tip +
        '<i class="ch-z" style="top:' + zero.toFixed(2) + '%"></i><i class="ch-bar' + (neg ? ' neg' : '') + (r.partial ? ' part' : '') + '" style="' + style + '"></i></button>';
    }).join('') +
    '</div><div class="ch-x" aria-hidden="true">' + rows.map((r, i) => '<span' + (i === sel ? ' class="on"' : '') + '>' + esc(tx(r.label)) + '</span>').join('') + '</div></div>';
}

function table(head, rows) {
  return '<details class="ch-tab"><summary>' + L('Ver en tabla', 'Show as table') + '</summary><div class="ch-tw"><table><thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>';
}

const kpi = (label, value, sub = '', cls = '') => '<div class="kp ' + cls + '"><span class="kp-l">' + label + '</span><b class="kp-v">' + value + '</b>' + (sub ? '<span class="kp-s">' + sub + '</span>' : '') + '</div>';
const sign = (v) => (v < 0 ? 'neg' : 'pos');

function renderKpis(sm) {
  return '<div class="kps">' +
    kpi(L('Limpio este mes', 'Net this month'), eur0(sm.month.net), badge(sm.month.change, L('Frente al mismo tramo del mes pasado', 'Vs the same days last month')) + ' <small>' + L('vs mes pasado (mismos días)', 'vs last month (same days)') + '</small>', sign(sm.month.net)) +
    kpi(L('Limpio en ', 'Net in ') + sm.year.label, eur0(sm.year.net), '', sign(sm.year.net)) +
    kpi(L('Ingresos ', 'Income ') + sm.year.label, eur0(sm.year.inc), '', 'inc') +
    kpi(L('Gastos ', 'Expenses ') + sm.year.label, eur0(sm.year.out), '', 'exp') +
    kpi(L('Media por día trabajado', 'Average per day worked'), sm.perDay === null ? '—' : eur0(sm.perDay), sm.workedDays + L(sm.workedDays === 1 ? ' día trabajado en ' : ' días trabajados en ', sm.workedDays === 1 ? ' day worked in ' : ' days worked in ') + sm.year.label) +
    kpi(L('Mejor mes del año', 'Best month this year'), sm.bestMonth ? esc(tx(sm.bestMonth.long.replace(/ \d{4}$/, ''))) : '—', sm.bestMonth ? eur0(sm.bestMonth.net) + L(' limpios', ' net') + (sm.bestMonth.partial ? L(' (en curso)', ' (in progress)') : '') : '') +
    '</div>';
}

function renderEvolution(rows, sel) {
  const r = rows[sel];
  const prevWhat = r.partial
    ? L('frente al mismo tramo ', 'vs the same days of ') + L(unit === 'sem' ? 'de la semana anterior' : unit === 'mes' ? 'del mes anterior' : 'del año anterior', unit === 'sem' ? 'last week' : unit === 'mes' ? 'last month' : 'last year')
    : L('frente ', 'vs ') + L(unit === 'sem' ? 'a la semana anterior' : unit === 'mes' ? 'al mes anterior' : 'al año anterior', unit === 'sem' ? 'the previous week' : unit === 'mes' ? 'the previous month' : 'the previous year');
  const head = [unit === 'sem' ? L('Semana', 'Week') : unit === 'mes' ? L('Mes', 'Month') : L('Año', 'Year'), L('Ingresos', 'Income'), L('Gastos', 'Expenses'), L('Limpio', 'Net'), L('vs anterior', 'vs previous')];
  return '<section class="dash-card">' +
    '<div class="ch-head"><h4>' + L('Evolución del beneficio', 'Profit trend') + '</h4><span class="ch-seg" role="group" aria-label="' + L('Periodo', 'Period') + '">' +
      [['sem', L('Semanas', 'Weeks')], ['mes', L('Meses', 'Months')], ['ano', L('Años', 'Years')]].map(([k, t]) => '<button type="button" data-chu="' + k + '" class="' + (unit === k ? 'on' : '') + '" aria-pressed="' + (unit === k) + '">' + t + '</button>').join('') +
    '</span></div>' +
    '<div class="ch-read" aria-live="polite">' +
      '<div class="ch-rt"><b>' + esc(tx(r.long)) + '</b>' + (r.partial ? '<span class="pill">' + L('en curso · hasta hoy', 'in progress · so far') + '</span>' : '<span class="pill done">' + L('completo', 'complete') + '</span>') + '</div>' +
      '<div class="ch-rg"><span><small>' + L('Ingresos', 'Income') + '</small><b class="c-inc">' + eur(r.inc) + '</b></span><span><small>' + L('Gastos', 'Expenses') + '</small><b class="c-exp">' + eur(r.out) + '</b></span>' +
      '<span><small>' + L('Limpio', 'Net') + '</small><b class="c-' + sign(r.net) + '">' + eur(r.net) + '</b></span></div>' +
      '<div class="ch-rc">' + badge(r.change, tx(r.prev.long)) + ' <span class="mut">' + prevWhat + ' (' + eur(r.prev.net) + ')</span></div>' +
    '</div>' +
    bars(rows, (x) => x.net, sel, 'net', 'ch-anim') +
    '<div class="ch-legend"><span><i class="lg pos"></i>' + L('Limpio', 'Net') + '</span><span><i class="lg neg"></i>' + L('Pérdida', 'Loss') + '</span><span><i class="lg part"></i>' + L('En curso', 'In progress') + '</span></div>' +
    '<h5>' + L('Evolución de los gastos', 'Expenses trend') + '</h5>' +
    bars(rows, (x) => x.out, sel, 'exp', 'ch-sm ch-anim exp') +
    table(head, rows.map((x) => [esc(tx(x.long)) + (x.partial ? ' *' : ''), eur(x.inc), eur(x.out), '<b>' + eur(x.net) + '</b>', x.change === null ? '—' : (x.change >= 0 ? '+' : '') + x.change + ' %'])) +
    (rows.some((x) => x.partial) ? '<div class="mut ch-note">* ' + L('En curso: cuenta hasta hoy y se compara con el mismo tramo del periodo anterior.', 'In progress: counts up to today and is compared with the same days of the previous period.') + '</div>' : '') +
    '</section>';
}

function renderExpenses(r) {
  const b = expenseBreakdown(S.mov, r.from, r.partial ? today() : r.to);
  const ticketOf = new Map((S.gas || []).filter((g) => g.mid && g.ph).map((g) => [g.mid, g.id]));
  if (!b.count) {
    return '<section class="dash-card"><h4>' + L('Análisis de gastos', 'Expense breakdown') + ' · ' + esc(tx(r.long)) + '</h4><div class="mut ch-note">' + L('No hay gastos apuntados en este periodo.', 'No expenses recorded in this period.') + '</div></section>';
  }
  const max = Math.max(...b.cats.map((c) => c.total), 1);
  return '<section class="dash-card"><h4>' + L('Análisis de gastos', 'Expense breakdown') + ' · ' + esc(tx(r.long)) + '</h4>' +
    '<div class="mut ch-note">' + L('Total ', 'Total ') + '<b>' + eur(b.total) + '</b> · ' + b.count + L(b.count === 1 ? ' gasto. Toca una categoría para ver sus apuntes.' : ' gastos. Toca una categoría para ver sus apuntes.', b.count === 1 ? ' expense. Tap a category to see its entries.' : ' expenses. Tap a category to see its entries.') + '</div>' +
    '<div class="cat-list">' + b.cats.map((c) => {
      const open = openCat === c.id;
      return '<div class="cat' + (open ? ' open' : '') + '"><button type="button" class="cat-row" data-cat="' + c.id + '" aria-expanded="' + open + '">' +
        '<span class="cat-n">' + esc(catName(c)) + '</span><span class="cat-t"><i style="width:' + Math.max(2, (c.total / max) * 100).toFixed(1) + '%"></i></span>' +
        '<span class="cat-v"><b>' + eur0(c.total) + '</b><small>' + String(c.pct).replace('.', isEn() ? '.' : ',') + ' %</small></span></button>' +
        (open ? '<div class="cat-items">' + c.items.slice(0, 30).map((m) => {
          const g = ticketOf.get(m.id);
          return '<div class="cat-it"><span>' + fd(m.f) + '</span><span class="cat-c">' + esc(m.c || '—') + '<small>' + esc(m.p === 'tarjeta' ? L('Tarjeta', 'Card') : L('Efectivo', 'Cash')) + '</small></span><b>' + eur(m.i) + '</b>' +
            (g ? '<button type="button" class="small-btn sec cat-tk" data-ticket="' + esc(g) + '">🧾 ' + L('Ticket', 'Receipt') + '</button>' : '') + '</div>';
        }).join('') + (c.items.length > 30 ? '<div class="mut ch-note">' + L('Y ', 'And ') + (c.items.length - 30) + L(' más.', ' more.') + '</div>' : '') + '</div>' : '') +
        '</div>';
    }).join('') + '</div></section>';
}

function renderDays() {
  const p = productivity(S.mov, today(), 90);
  if (!p.workedDays) {
    return '<section class="dash-card"><h4>' + L('Qué días rindes más', 'Which days pay best') + '</h4><div class="mut ch-note">' + L('Aún no hay días trabajados en los últimos 90 días.', 'No days worked in the last 90 days yet.') + '</div></section>';
  }
  const rows = p.list.map((w) => ({ ...w, label: isEn() ? DAY_EN[w.name].charAt(0) : w.label, long: w.name }));
  return '<section class="dash-card"><h4>' + L('Qué días rindes más', 'Which days pay best') + '</h4>' +
    '<div class="ch-read" data-days aria-live="polite">' +
      (p.best ? '<span class="tag good">▲ ' + L('Mejor', 'Best') + ': <b>' + dayName(p.best.name) + '</b> · ' + eur0(p.best.avg) + '</span>' : '') +
      (p.worst ? '<span class="tag bad">▼ ' + L('Peor', 'Worst') + ': <b>' + dayName(p.worst.name) + '</b> · ' + eur0(p.worst.avg) + '</span>' : '') +
    '</div>' +
    bars(rows.map((w) => ({ ...w, long: dayName(w.name) })), (w) => w.avg, -1, 'dia', 'ch-anim') +
    '<div class="mut ch-note">' + L('Media de lo limpio (ingresos menos gastos del día) en los días trabajados, del ', 'Average net (income minus that day’s expenses) on days worked, from ') + fd(p.from) + L(' al ', ' to ') + fd(p.to) + ' (' + p.days + L(' días): ', ' days): ') +
      p.workedDays + L(' días trabajados. Un día sin ingresos no cuenta como trabajado.', ' days worked. A day with no income doesn’t count as worked.') + '</div>' +
    table([L('Día', 'Day'), L('Días trabajados', 'Days worked'), L('Media limpia', 'Average net')], p.list.map((w) => [dayName(w.name), w.worked, w.worked ? eur(w.avg) : '—'])) +
    '</section>';
}

export function renderCharts() {
  const box = $('#graf');
  if (!box) return;
  box.setAttribute('translate', 'no');
  const title = '<div class="dash-top"><h3 class="mt0">📊 ' + L('Estadísticas', 'Statistics') + '</h3><span class="mut">' + L('Con tus apuntes de la caja', 'From your cash entries') + '</span></div>';
  if (!cleanMovements(S.mov).length) {
    box.innerHTML = title + '<div class="mut">' + L('Cuando apuntes ingresos y gastos, aquí verás tu beneficio por semanas, meses y años, en qué gastas y qué días rindes más.',
      'When you record income and expenses, you’ll see your profit by week, month and year, where your money goes and which days pay best.') + '</div>';
    return;
  }
  const day = today();
  const rows = evolution(S.mov, unit, day);
  const sel = picked !== null && picked < rows.length ? picked : rows.length - 1;
  box.innerHTML = title + renderKpis(summary(S.mov, day)) + renderEvolution(rows, sel) + renderExpenses(rows[sel]) + renderDays();
}

export function initCharts() {
  const box = $('#graf');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const u = e.target.closest('[data-chu]');
    if (u) { if (unit !== u.dataset.chu) { unit = u.dataset.chu; picked = null; openCat = null; renderCharts(); } return; }
    const b = e.target.closest('.ch-col[data-ch="net"], .ch-col[data-ch="exp"]');
    if (b) { picked = +b.dataset.i; openCat = null; renderCharts(); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { openCat = openCat === c.dataset.cat ? null : c.dataset.cat; renderCharts(); return; }
    const t = e.target.closest('[data-ticket]');
    if (t) { showReceipt(t.dataset.ticket); return; }
    const d = e.target.closest('.ch-col[data-ch="dia"]');
    if (d) {
      const p = productivity(S.mov, today(), 90);
      const w = p.list[+d.dataset.i];
      const read = box.querySelector('[data-days]');
      if (read) {
        read.innerHTML = '<b>' + dayName(w.name) + ':</b> ' + (w.worked ? eur(w.avg) + L(' limpios de media · ', ' net on average · ') + w.worked + L(w.worked === 1 ? ' día trabajado' : ' días trabajados', w.worked === 1 ? ' day worked' : ' days worked') : L('sin días trabajados en el periodo', 'no days worked in the period'));
      }
      box.querySelectorAll('.ch-col[data-ch="dia"]').forEach((x) => { x.classList.toggle('on', x === d); x.setAttribute('aria-pressed', String(x === d)); });
    }
  });
}

