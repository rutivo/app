// Pantalla "Hucha": ahorro con objetivo por periodo.
import { $, onClick, toast } from '../dom.js';
import { savingsByPeriod, savingsPeriod, savingsStatus } from '../money.js';
import { S, save } from '../store.js';
import { dm, esc, eur, fd, r2, today, uid } from '../utils.js';

const DEFAULT_GOAL = 500;
const goal = () => S.cfg.hm || DEFAULT_GOAL;
const startDay = () => Math.min(28, S.cfg.hd || 1);

export function renderHucha() {
  const day = today();
  const st = savingsStatus(S.huc, day, goal(), S.cfg.hd);
  const P = st.period;

  $('#hres').innerHTML =
    '<div class="mut">Hucha: del ' + dm(P.a) + ' al ' + dm(P.b) + '</div>' +
    '<div class="big">' + eur(st.saved) + '</div><div class="mut">de ' + eur(goal()) + '</div>' +
    '<div class="progress"><div style="width:' + st.pct + '%"></div></div>' +
    '<div class="grid">' +
    '<div><b>' + eur(st.missing) + '</b>Te falta</div>' +
    '<div><b>' + eur(st.perDayLeft) + '</b>Cada día que queda</div>' +
    '<div><b>' + eur(st.daily) + '</b>Objetivo diario</div>' +
    '<div><b>' + st.daysLeft + '</b>Días que quedan</div></div>' +
    '<div class="mut mt10">' + (st.onTrack ? 'Vas al día ✓' : 'Para ir al día te faltan ' + eur(r2(st.expected - st.saved))) + '</div>';

  $('#hq').textContent = 'Meter hoy ' + eur(st.daily);
  $('#hq').dataset.v = st.daily;
  $('#hi').placeholder = String(st.daily);
  $('#hm').value = goal();
  $('#hd').value = startDay();

  $('#hl').innerHTML = st.list.length
    ? st.list
        .map((x) => '<div class="it"><div>' + fd(x.f) + '</div><div><b class="in">+' + eur(x.i) + '</b><button class="x" data-dh="' + esc(x.id) + '" aria-label="Borrar">×</button></div></div>')
        .join('')
    : '<span class="mut">Aún no has metido nada en este periodo.</span>';

  const groups = savingsByPeriod(S.huc, S.cfg.hd);
  const past = Object.keys(groups).filter((a) => a !== P.a).sort().reverse();
  $('#hh').innerHTML = past.length
    ? past
        .map(
          (a) =>
            '<div class="it"><div>' + dm(a) + ' → ' + dm(savingsPeriod(a, S.cfg.hd).b) +
            '<small>' + (groups[a] >= goal() ? 'Objetivo cumplido ✓' : 'No llegaste al objetivo') + '</small></div>' +
            '<b>' + eur(groups[a]) + '</b></div>',
        )
        .join('')
    : '<span class="mut">Todavía no hay periodos anteriores.</span>';
}

function addSaving(day, amount) {
  if (!(amount > 0)) {
    toast('Escribe un importe.');
    return;
  }
  S.huc.push({ id: uid(), f: day, i: r2(amount) });
  save();
  renderHucha();
  toast('Metido en la hucha ✓');
}

export function initHucha() {
  $('#hdt').value = today();
  $('#fh').onsubmit = (e) => {
    e.preventDefault();
    addSaving($('#hdt').value || today(), +$('#hi').value);
    $('#hi').value = '';
  };
  $('#hq').onclick = () => addSaving(today(), +$('#hq').dataset.v);
  $('#hm').onchange = () => {
    S.cfg.hm = +$('#hm').value || DEFAULT_GOAL;
    save();
    renderHucha();
  };
  $('#hd').onchange = () => {
    S.cfg.hd = Math.min(28, Math.max(1, +$('#hd').value || 1));
    save();
    renderHucha();
  };
  onClick('[data-dh]', (el) => {
    S.huc = S.huc.filter((x) => x.id !== el.dataset.dh);
    save();
    renderHucha();
  });
}
