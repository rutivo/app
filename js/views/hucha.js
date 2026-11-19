// Pantalla "Hucha": varias huchas con meta, bote que se llena, racha, calendario y meses.
import { $, bottomSheet, confirmTapTimed, onClick, readFlag, toast, writeFlag } from '../dom.js';
import { EMOJIS, MAIN, depositDays, entriesOf, huchaStatus, huchasOf, monthlyTotals, reachesGoal, streak } from '../huchas.js';
import { S, save } from '../store.js';
import { MONTHS, cap, esc, eur, fd, r2, today, uid } from '../utils.js';

const SEL_KEY = 'huchaSel';

const list = () => huchasOf(S.cfg);
const current = () => list().find((h) => h.id === readFlag(SEL_KEY)) || list()[0];

/** Guarda la lista de huchas en la configuración (la primera vez materializa "Mi hucha"). */
function storeHuchas(huchas) {
  S.cfg.huchas = huchas;
  save();
}

// ---------- el bote ----------

function jarSvg(pct, emoji) {
  const H = 172; // alto del interior
  const shift = Math.round(H * (1 - pct / 100));
  return (
    '<svg class="jar" viewBox="0 0 200 250" aria-hidden="true">' +
    '<defs><clipPath id="jarclip"><path d="M40 62 Q30 66 30 86 L30 214 Q30 238 56 238 L144 238 Q170 238 170 214 L170 86 Q170 66 160 62Z"/></clipPath>' +
    '<linearGradient id="gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#d49b16"/></linearGradient>' +
    '<pattern id="coins" width="26" height="14" patternUnits="userSpaceOnUse"><ellipse cx="13" cy="7" rx="11" ry="4.5" fill="#f9d870" stroke="#b8860b" stroke-width="1.2"/></pattern></defs>' +
    '<g clip-path="url(#jarclip)"><g class="jar-fill" style="transform:translateY(' + shift + 'px)">' +
    '<rect x="20" y="62" width="160" height="200" fill="url(#gold)"/>' +
    '<rect x="20" y="62" width="160" height="200" fill="url(#coins)" opacity=".55"/>' +
    '<path d="M20 66 Q60 54 100 64 T180 62 L180 72 L20 72Z" fill="#ffe9a8"/></g></g>' +
    '<path d="M40 62 Q30 66 30 86 L30 214 Q30 238 56 238 L144 238 Q170 238 170 214 L170 86 Q170 66 160 62Z" fill="rgba(255,255,255,.07)" stroke="rgba(160,190,230,.55)" stroke-width="4"/>' +
    '<path d="M46 92 Q42 150 48 210" stroke="rgba(255,255,255,.35)" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<rect x="48" y="30" width="104" height="30" rx="8" fill="#c99a2e"/><rect x="48" y="30" width="104" height="10" rx="5" fill="#e6b84a"/>' +
    '<rect x="86" y="36" width="28" height="5" rx="2.5" fill="#6b4c0f"/>' +
    '<circle cx="100" cy="150" r="34" fill="rgba(255,255,255,.85)"/>' +
    '<text x="100" y="163" text-anchor="middle" font-size="38">' + esc(emoji) + '</text>' +
    '</svg>'
  );
}

function dropCoin() {
  const box = $('#hjar .jarbox');
  if (!box) return;
  const c = document.createElement('div');
  c.className = 'coin';
  c.textContent = '🪙';
  box.appendChild(c);
  setTimeout(() => c.remove(), 900);
  try {
    navigator.vibrate && navigator.vibrate(25);
  } catch {
    /* sin vibración */
  }
}

function confetti() {
  const colors = ['#ffd23f', '#1d5fe0', '#18a058', '#e5322d', '#ff8c42', '#b06ef3'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.5 + 's';
    p.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3500);
}

// ---------- pintar ----------

function renderChips(sel) {
  $('#hchips').innerHTML =
    list()
      .map((h) => '<button type="button" class="hchip' + (h.id === sel.id ? ' on' : '') + '" data-hsel="' + esc(h.id) + '">' + esc(h.e) + ' ' + esc(h.n) + '</button>')
      .join('') + '<button type="button" class="hchip add" id="hnew">＋ Nueva</button>';
}

function renderJar(h, st, day) {
  let line;
  if (st.done) line = '🎉 ¡Meta conseguida!' + (st.saved > st.goal ? ' Llevas ' + eur(st.saved - st.goal) + ' de más.' : '');
  else if (h.fl && st.daysLeft) line = '🎯 Meta el ' + fd(h.fl) + ' · mete <b>' + eur(st.perDay) + '</b> al día y llegas';
  else if (h.fl && h.fl < day) line = 'La fecha de la meta (' + fd(h.fl) + ') ya pasó. Cámbiala en «Editar».';
  else if (st.eta) line = '📈 A este ritmo llegas el <b>' + fd(st.eta) + '</b>';
  else line = 'Mete un poco cada día y verás cuándo llegas.';
  if (h.fl && st.late && !st.done) line += '<br><span class="out">A tu ritmo actual llegarías el ' + fd(st.eta) + ', un poco tarde.</span>';
  $('#hjar').innerHTML =
    '<div class="jarbox">' + jarSvg(st.pct, h.e) + '</div>' +
    '<div class="jar-info">' +
    '<div class="mut">' + esc(h.e) + ' ' + esc(h.n) + '</div>' +
    '<div class="big">' + eur(st.saved) + '</div>' +
    '<div class="mut">de ' + eur(st.goal) + ' · <b class="' + (st.done ? 'in' : '') + '">' + st.pct + '%</b>' + (st.done ? '' : ' · te faltan ' + eur(st.missing)) + '</div>' +
    '<div class="jar-line mt8">' + line + '</div>' +
    '</div>' +
    '<button type="button" id="hq" class="hq">🪙 Meter hoy ' + eur(st.perDay || h.a || 10) + '</button>' +
    '<div class="row2"><button type="button" class="sec" id="hother">＋ Otra cantidad</button><button type="button" class="sec" id="hout">➖ Sacar</button></div>';
}

function renderStats(day) {
  const n = streak(S.huc, day);
  const metToday = S.huc.some((x) => x.f === day && x.i > 0);
  $('#hstreak').innerHTML =
    '<div class="fire">' + (n ? '🔥' : '🌱') + '</div><div><b>' + (n ? n + (n === 1 ? ' día seguido' : ' días seguidos') : 'Empieza tu racha hoy') + '</b>' +
    '<div class="mut">' + (n ? (metToday ? '¡Hoy ya has metido! Sigue así.' : 'Mete algo hoy para no perder la racha.') : 'Mete algo cada día y sube la racha.') + '</div></div>';
  const ym = day.slice(0, 7);
  const done = depositDays(S.huc, ym);
  const first = new Date(ym + '-01T12:00:00');
  const lead = (first.getDay() + 6) % 7; // lunes = 0
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => '<span class="h">' + d + '</span>').join('');
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const iso = ym + '-' + String(d).padStart(2, '0');
    cells += '<span class="' + (done.has(iso) ? 'ok' : '') + (iso === day ? ' today' : '') + (iso > day ? ' fut' : '') + '">' + d + '</span>';
  }
  $('#hcal').innerHTML = '<div class="mut">' + cap(MONTHS[+ym.slice(5) - 1]) + ' · ' + done.size + ' días con ahorro</div><div class="hcal-grid">' + cells + '</div>';
}

function renderBars(h, day) {
  const months = monthlyTotals(entriesOf(S.huc, h.id), day, 6);
  const max = Math.max(1, ...months.map((m) => Math.abs(m.total)));
  $('#hbars').innerHTML = months
    .map((m) => {
      const pct = Math.round((Math.abs(m.total) / max) * 100);
      return '<div class="hbar' + (m.total < 0 ? ' neg' : '') + (m.ym === day.slice(0, 7) ? ' now' : '') + '"><small>' + (m.total ? eur(m.total).replace(',00', '') : '') + '</small>' +
        '<div class="col"><div style="height:' + pct + '%"></div></div><span>' + cap(MONTHS[+m.ym.slice(5) - 1]).slice(0, 3) + '</span></div>';
    })
    .join('');
}

let showAll = false;

function renderList(st) {
  const more = st.list.length > 8 && !showAll;
  $('#hl').innerHTML = st.list.length
    ? st.list
        .slice(0, more ? 8 : 200)
        .map(
          (x) =>
            '<div class="it"><div>' + fd(x.f) + (x.c ? '<small>' + esc(x.c) + '</small>' : '') + '</div>' +
            '<div><b class="' + (x.i < 0 ? 'out' : 'in') + '">' + (x.i < 0 ? '−' : '+') + eur(Math.abs(x.i)) + '</b><button class="x" data-dh="' + esc(x.id) + '" aria-label="Borrar">×</button></div></div>',
        )
        .join('') + (more ? '<button type="button" class="sec small-btn mt8" id="hall">Ver todos (' + st.list.length + ')</button>' : '')
    : '<span class="mut">Aún no hay movimientos en esta hucha. Toca «Meter hoy» para empezar.</span>';
}

function formHtml(h) {
  return (
    '<label class="f" for="hfn">Nombre</label><input id="hfn" maxlength="30" value="' + esc(h ? h.n : '') + '" placeholder="Vacaciones, ruedas nuevas…">' +
    '<label class="f">Icono</label><div class="hemo">' +
    EMOJIS.map((e) => '<button type="button" data-hemo="' + e + '" class="' + ((h ? h.e : '🏖️') === e ? 'on' : '') + '">' + e + '</button>').join('') + '</div>' +
    '<div class="row"><div><label class="f" for="hfm">Meta (€)</label><input id="hfm" type="number" min="1" step="1" inputmode="decimal" value="' + (h ? h.m : '') + '"></div>' +
    '<div><label class="f" for="hff">Fecha límite (opcional)</label><input id="hff" type="date" value="' + (h && h.fl ? h.fl : '') + '"></div></div>' +
    '<label class="f" for="hfa">Cada día meto (si no hay fecha límite)</label><input id="hfa" type="number" min="0.5" step="0.5" inputmode="decimal" value="' + (h ? h.a || 10 : 10) + '">'
  );
}

function readForm(box, base) {
  const n = box.querySelector('#hfn').value.trim();
  const m = +box.querySelector('#hfm').value;
  if (!n) { toast('Ponle un nombre a la hucha.'); return null; }
  if (!(m > 0)) { toast('Escribe la meta en euros.'); return null; }
  const sel = box.querySelector('[data-hemo].on');
  return { ...base, n, m: r2(m), e: sel ? sel.dataset.hemo : '🐷', fl: box.querySelector('#hff').value || '', a: r2(+box.querySelector('#hfa').value || 10) };
}

function renderEdit(h) {
  $('#hform').innerHTML = formHtml(h) +
    '<button type="button" id="hsave">Guardar cambios</button>' +
    '<button type="button" class="sec danger-btn" id="hdel">Borrar esta hucha</button>';
}

export function renderHucha() {
  const day = today();
  const h = current();
  const st = huchaStatus(h, S.huc, day);
  renderChips(h);
  renderJar(h, st, day);
  renderStats(day);
  renderBars(h, day);
  renderList(st);
  if (!$('#hedit').open) renderEdit(h);
}

// ---------- acciones ----------

function addMove(day, amount, reason) {
  const h = current();
  const before = huchaStatus(h, S.huc, today()).saved;
  S.huc.push({ id: uid(), f: day, i: r2(amount), h: h.id, ...(reason ? { c: reason } : {}) });
  if (!S.cfg.huchas) S.cfg.huchas = list(); // la primera vez se guarda "Mi hucha"
  save();
  renderHucha();
  if (amount > 0) {
    dropCoin();
    const after = before + amount;
    if (reachesGoal(before, after, h.m)) {
      confetti();
      toast('🎉 ¡Meta conseguida en «' + h.n + '»!');
    } else toast('Metido en «' + h.n + '» ✓');
  } else toast('Sacado de «' + h.n + '»');
}

function sheetAmount(kind) {
  const h = current();
  const out = kind === 'out';
  const saved = huchaStatus(h, S.huc, today()).saved;
  const sheet = bottomSheet(
    '<h3>' + (out ? '➖ Sacar de ' : '＋ Meter en ') + esc(h.e) + ' ' + esc(h.n) + '</h3>' +
    (out ? '<div class="mut">Hay ' + eur(saved) + ' en esta hucha.</div>' : '') +
    '<div class="row"><div><label class="f" for="hsd">Día</label><input type="date" id="hsd" value="' + today() + '"></div>' +
    '<div><label class="f" for="hsi">Importe (€)</label><input id="hsi" type="number" step="0.01" min="0" inputmode="decimal"></div></div>' +
    (out ? '<label class="f" for="hsc">Motivo</label><input id="hsc" maxlength="60" placeholder="Pagué el IVA, taller…">' : '') +
    '<button type="button" id="hsok">' + (out ? 'Sacar' : 'Meter') + '</button><button type="button" class="sec" data-close>Cancelar</button>',
  );
  setTimeout(() => sheet.querySelector('#hsi').focus(), 50);
  sheet.querySelector('#hsok').onclick = () => {
    const v = r2(+sheet.querySelector('#hsi').value);
    if (!(v > 0)) return toast('Escribe un importe.');
    if (out && v > saved) return toast('Solo hay ' + eur(saved) + ' en esta hucha.');
    const reason = out ? sheet.querySelector('#hsc').value.trim() : '';
    sheet.close();
    addMove(sheet.querySelector('#hsd').value || today(), out ? -v : v, reason);
  };
}

function sheetNew() {
  const sheet = bottomSheet('<h3>＋ Nueva hucha</h3>' + formHtml(null) + '<button type="button" id="hcreate">Crear hucha</button><button type="button" class="sec" data-close>Cancelar</button>');
  sheet.querySelector('#hcreate').onclick = () => {
    const h = readForm(sheet, { id: uid() });
    if (!h) return;
    storeHuchas([...list(), h]);
    writeFlag(SEL_KEY, h.id);
    sheet.close();
    renderHucha();
    toast('Hucha «' + h.n + '» creada ✓');
  };
}

export function initHucha() {
  onClick('[data-hsel]', (el) => {
    writeFlag(SEL_KEY, el.dataset.hsel);
    $('#hedit').open = false;
    showAll = false;
    renderHucha();
  });
  onClick('#hnew', sheetNew);
  onClick('#hall', () => {
    showAll = true;
    renderHucha();
  });
  onClick('#hq', () => {
    const h = current();
    const st = huchaStatus(h, S.huc, today());
    addMove(today(), st.perDay || h.a || 10);
  });
  onClick('#hother', () => sheetAmount('in'));
  onClick('#hout', () => sheetAmount('out'));
  onClick('[data-hemo]', (el) => {
    el.parentElement.querySelectorAll('[data-hemo]').forEach((b) => b.classList.toggle('on', b === el));
  });
  onClick('#hsave', () => {
    const h = current();
    const next = readForm($('#hform'), h);
    if (!next) return;
    storeHuchas(list().map((x) => (x.id === h.id ? next : x)));
    $('#hedit').open = false;
    renderHucha();
    toast('Cambios guardados ✓');
  });
  onClick('#hdel', (el) => {
    const h = current();
    if (list().length === 1) return toast('Es tu única hucha. Cámbiale el nombre o la meta en vez de borrarla.');
    if (!confirmTapTimed(el, 'Toca otra vez para borrar «' + h.n + '» y sus movimientos')) return;
    storeHuchas(list().filter((x) => x.id !== h.id));
    S.huc = S.huc.filter((x) => (x.h || MAIN) !== h.id);
    save();
    writeFlag(SEL_KEY, list()[0].id);
    $('#hedit').open = false;
    renderHucha();
    toast('Hucha borrada');
  });
  onClick('[data-dh]', (el) => {
    S.huc = S.huc.filter((x) => x.id !== el.dataset.dh);
    save();
    renderHucha();
  });
}

