// Pantalla "Caja": resumen del mes, trimestres y movimientos del día.
import { $, onClick } from '../dom.js';
import { cashStats, baseOf } from '../money.js';
import { S, save } from '../store.js';
import { cap, esc, eur, monthName, quarterOf, r2, sum, today, uid } from '../utils.js';
import { sendQuarterToAccountant } from './gestor.js';
import { renderUpcoming } from './proximos.js';
import { renderTips } from './tips.js';

const statsGrid = (cells) =>
  '<div class="grid">' + cells.map(([value, label, cls]) => '<div><b' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</b>' + label + '</div>').join('') + '</div>';

function monthStats(month) {
  const c = cashStats(S.mov.filter((x) => x.f.startsWith(month)));
  return {
    ...c,
    gas: sum(S.gas.filter((g) => g.f.startsWith(month)), (g) => g.i),
    services: S.srv.filter((x) => x.f.startsWith(month)).length,
  };
}

function renderMonths() {
  const current = today().slice(0, 7);
  const months = [...new Set([current, ...[...S.mov, ...S.srv, ...S.gas].map((x) => x.f.slice(0, 7))])].sort().reverse();
  const c = monthStats(current);

  $('#mes').innerHTML =
    '<div class="mut">' + monthName(current) + ': lo que llevas</div>' +
    '<div class="big">' + eur(c.in - c.out) + '</div>' +
    statsGrid([
      [eur(c.in), 'Ingresos', 'in'],
      [eur(c.out), 'Gastos', 'out'],
      [eur(c.gas), 'Gasolina'],
      [c.services, 'Servicios Transfer'],
      [eur(c.netCash), 'Neto en efectivo'],
      [eur(c.netCard), 'Neto con tarjeta'],
    ]);

  $('#lmes').innerHTML = months
    .map((m) => {
      const s = monthStats(m);
      return (
        '<div class="it"><div>' + monthName(m) +
        '<small>' + eur(s.in) + ' ingresos · ' + eur(s.out) + ' gastos · ' + s.services + ' servicios</small></div>' +
        '<b>' + eur(s.in - s.out) + '</b></div>'
      );
    })
    .join('');
}

function renderQuarter() {
  const current = quarterOf(today());
  const select = $('#tq');
  const keep = select.value;
  const quarters = [...new Set([current, ...S.mov.map((m) => quarterOf(m.f))])].sort().reverse();
  select.innerHTML = quarters.map((k) => '<option value="' + k + '">T' + k.slice(-1) + ' ' + k.slice(0, 4) + '</option>').join('');
  select.value = quarters.includes(keep) ? keep : current;

  const q = select.value;
  const c = cashStats(S.mov.filter((m) => quarterOf(m.f) === q));
  const iva = S.cfg.iva || 0;
  const base = baseOf(c.in, iva);
  const gas = sum(S.gas.filter((g) => quarterOf(g.f) === q), (g) => g.i);

  $('#tres').innerHTML =
    '<div class="mut">Has facturado</div><div class="big">' + eur(c.in) + '</div>' +
    statsGrid([
      [eur(c.inCard), 'En tarjeta'],
      [eur(c.inCash), 'En efectivo'],
      [eur(base), 'Base sin IVA'],
      [eur(r2(c.in - base)), 'IVA (' + iva + '%)'],
      [eur(c.out), 'Gastos', 'out'],
      [eur(gas), 'Gasolina'],
    ]);
}

export function renderCaja() {
  renderTips();
  renderUpcoming();
  renderMonths();
  renderQuarter();

  const day = $('#dia').value;
  const list = S.mov.filter((m) => m.f === day);
  const c = cashStats(list);

  $('#res').innerHTML =
    '<div class="mut">Balance del día</div><div class="big">' + eur(c.in - c.out) + '</div>' +
    statsGrid([
      [eur(c.in), 'Ingresos', 'in'],
      [eur(c.out), 'Gastos', 'out'],
      [eur(c.netCash), 'Neto en efectivo'],
      [eur(c.netCard), 'Neto con tarjeta'],
    ]);

  $('#lm').innerHTML = list.length
    ? list
        .map(
          (m) =>
            '<div class="it"><div>' + esc(m.c) + '<small>' + esc(cap(m.p)) + '</small></div>' +
            '<div><b class="' + (m.t === 'in' ? 'in' : 'out') + '">' + (m.t === 'in' ? '+' : '-') + eur(m.i) + '</b>' +
            '<button class="x" data-dm="' + esc(m.id) + '" aria-label="Borrar">×</button></div></div>',
        )
        .join('')
    : '<span class="mut">Aún no hay movimientos este día. Añade el primero arriba.</span>';
}

export function initCaja() {
  $('#dia').value = today();
  $('#dia').onchange = renderCaja;
  $('#tq').onchange = renderQuarter;
  $('#tqsend').onclick = () => sendQuarterToAccountant($('#tq').value);

  $('#fm').onsubmit = (e) => {
    e.preventDefault();
    const checked = (name) => document.querySelector('input[name=' + name + ']:checked').value;
    S.mov.push({ id: uid(), f: $('#dia').value, t: checked('t'), p: checked('p'), i: +$('#mi').value, c: $('#mc').value.trim() });
    save();
    $('#mi').value = '';
    $('#mc').value = '';
    renderCaja();
  };

  onClick('[data-dm]', (el) => {
    S.mov = S.mov.filter((m) => m.id !== el.dataset.dm);
    save();
    renderCaja();
  });
}
