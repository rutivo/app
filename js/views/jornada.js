// "Mi jornada": km y horas del día, objetivo diario y cierre del día con imagen.
import { $, bottomSheet, downloadBlob, saveFile, toast } from '../dom.js';
import { compareDay, dayStats, formatHours } from '../jornada.js';
import { accentColor } from '../logo.js';
import { S, save } from '../store.js';
import { eur, fd, today, uid } from '../utils.js';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const kmText = (k) => k.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' km';
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

let rerenderAll = () => {};
const day = () => $('#dia').value;
const jorOf = (d) => (S.jor || []).find((j) => j.f === d);

function setJornada(d, values) {
  S.jor = S.jor || [];
  let j = jorOf(d);
  if (!j) {
    j = { id: uid(), f: d };
    S.jor.push(j);
  }
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === undefined) delete j[k];
    else j[k] = k === 'ki' || k === 'kf' ? +v : v;
  }
  save();
}

const inputs = () => ({ ki: $('#jki').value, kf: $('#jkf').value, hi: $('#jhi').value, hf: $('#jhf').value });
const cell = (value, label, cls) => '<div><b' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</b>' + label + '</div>';

function statsGrid(st) {
  return (
    '<div class="grid">' +
    cell(eur(st.inc), 'Ingresos', 'in') + cell(eur(st.out), 'Gastos', 'out') +
    cell(st.km ? kmText(st.km) : '—', 'Km recorridos') + cell(st.perKm !== null ? eur(st.perKm) + '/km' : '—', 'Beneficio por km') +
    cell(st.h ? formatHours(st.h) : '—', 'Horas trabajadas') + cell(st.perH !== null ? eur(st.perH) + '/h' : '—', 'Beneficio por hora') +
    '</div>'
  );
}

/** Cifras de la jornada (se recalculan al escribir, sin esperar a guardar). */
function renderStats() {
  const st = dayStats(S.mov, day(), inputs());
  const goal = S.cfg.objDia || 0;
  const pct = goal ? Math.max(0, Math.min(100, Math.round((st.ben / goal) * 100))) : 0;
  $('#jst').innerHTML =
    '<div class="mut">Beneficio limpio del día</div><div class="big ' + (st.ben >= 0 ? '' : 'out') + '">' + eur(st.ben) + '</div>' +
    statsGrid(st) +
    (goal
      ? '<div class="mut mt10">🎯 Objetivo: ' + eur(st.ben) + ' de ' + eur(goal) +
        (st.ben >= goal ? ' · ¡Conseguido! 🎉' : ' · te faltan ' + eur(goal - st.ben)) + '</div>' +
        '<div class="progress"><div style="width:' + pct + '%"></div></div>'
      : '') +
    (!st.km ? '<div class="mut mt8">Apunta los km de inicio y fin para ver lo que ganas por km.</div>' : '');
}

export function renderJornada() {
  const box = $('#jor');
  if (!box) return;
  const d = day();
  const j = jorOf(d) || {};
  // Mismo día ya dibujado: solo se actualizan valores y cifras. Rehacer las
  // casillas haría perder lo que se está escribiendo al pasar de una a otra.
  if (box.dataset.day === d && box.querySelector('#jki')) {
    const values = { jki: j.ki ?? '', jkf: j.kf ?? '', jhi: j.hi || '', jhf: j.hf || '', jobj: S.cfg.objDia || '' };
    for (const [id, v] of Object.entries(values)) {
      const el = $('#' + id);
      if (el !== document.activeElement && el.value !== String(v)) el.value = v;
    }
    renderStats();
    return;
  }
  box.dataset.day = d;
  box.innerHTML =
    '<div class="jor-head"><b>🚖 Mi jornada</b><span class="mut">' + (d === today() ? 'Hoy' : fd(d)) + '</span></div>' +
    '<div class="row">' +
    '<div><label class="f" for="jki">Km al empezar</label><input id="jki" type="number" inputmode="numeric" min="0" step="1" value="' + (j.ki ?? '') + '"></div>' +
    '<div><label class="f" for="jkf">Km al terminar</label><input id="jkf" type="number" inputmode="numeric" min="0" step="1" value="' + (j.kf ?? '') + '"></div></div>' +
    '<div class="row">' +
    '<div><label class="f" for="jhi">Empecé</label><div class="tm"><input id="jhi" type="time" value="' + (j.hi || '') + '"><button type="button" class="sec" id="jhin">Ahora</button></div></div>' +
    '<div><label class="f" for="jhf">Terminé</label><div class="tm"><input id="jhf" type="time" value="' + (j.hf || '') + '"><button type="button" class="sec" id="jhfn">Ahora</button></div></div></div>' +
    '<div id="jst" class="mt12"></div>' +
    '<button type="button" id="jclose">🏁 Cerrar el día</button>' +
    '<details class="mt10"><summary class="mut">🎯 Objetivo diario</summary>' +
    '<label class="f" for="jobj">Quiero ganar limpio al día (€)</label><input id="jobj" type="number" min="0" step="1" inputmode="decimal" value="' + (S.cfg.objDia || '') + '"></details>';

  const store = () => {
    const v = inputs();
    if (v.ki !== '' && v.kf !== '' && +v.kf <= +v.ki) {
      toast('Los km al terminar deben ser mayores que al empezar.');
      return;
    }
    setJornada(d, v);
    renderStats();
    rerenderAll();
  };
  for (const id of ['jki', 'jkf', 'jhi', 'jhf']) {
    $('#' + id).onchange = store;
    $('#' + id).oninput = renderStats;
  }
  $('#jhin').onclick = () => {
    $('#jhi').value = nowHM();
    store();
    toast('¡Buena jornada! 🚖 Empiezas a las ' + $('#jhi').value + '. Apunta los km del cuentakilómetros.');
  };
  $('#jhfn').onclick = () => {
    $('#jhf').value = nowHM();
    store();
    toast('Jornada terminada a las ' + $('#jhf').value + '. Apunta los km y toca «Cerrar el día».');
  };
  $('#jobj').onchange = () => {
    S.cfg.objDia = +$('#jobj').value || 0;
    save();
    renderStats();
  };
  $('#jclose').onclick = () => closeDay(d);
  renderStats();
}

// ---------- cierre del día ----------

function badgesFor(c) {
  const out = [];
  if (c.record) out.push(['gold', '🏆 ¡Tu mejor día del último mes!']);
  if (c.vsAvg !== null) out.push(c.vsAvg >= 0 ? ['up', '📈 +' + c.vsAvg + '% sobre tu media diaria (' + eur(c.avgBen) + ')'] : ['down', '📉 ' + c.vsAvg + '% bajo tu media diaria (' + eur(c.avgBen) + ')']);
  if (c.kmVsAvg !== null) out.push(c.kmVsAvg >= 0 ? ['up', '🛣️ Km más rentables que tu media (+' + c.kmVsAvg + '%)'] : ['down', '🛣️ Km menos rentables que tu media (' + c.kmVsAvg + '%)']);
  if (c.goalMet) out.push(['gold', '🎯 Objetivo diario cumplido']);
  return out;
}

function phraseFor(c) {
  if (c.today.inc === 0) return 'Hoy no hay ingresos apuntados. ¡Mañana más! 💪';
  return c.today.ben >= (c.avgBen || 0) ? '¡Gran día! A descansar, que te lo has ganado. 🚖✨' : 'Día flojo, pero cada día cuenta. ¡Mañana a por más! 💪';
}

function closeDay(d) {
  const c = compareDay(S, d, S.cfg.objDia || 0);
  const st = c.today;
  const title = 'Cierre del ' + WEEKDAYS[new Date(d + 'T12:00:00').getDay()] + ' ' + fd(d);
  const badges = badgesFor(c);
  const phrase = phraseFor(c);
  const sheet = bottomSheet(
    '<div class="mut">🏁 ' + title + '</div>' +
    '<div class="close-big ' + (st.ben >= 0 ? 'in' : 'out') + '">' + eur(st.ben) + '</div>' +
    '<div class="mut">de beneficio limpio · ' + st.count + ' cobros</div>' +
    statsGrid(st) +
    '<div>' + badges.map(([cls, text]) => '<span class="badge ' + cls + '">' + text + '</span>').join('') + '</div>' +
    '<div class="mt12"><b>' + phrase + '</b></div>' +
    '<button type="button" id="dayimg">🖼️ Guardar imagen del día</button>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  sheet.querySelector('#dayimg').onclick = () => saveDayImage(st, title, badges, phrase);
}

/** Imagen 1080×1350 con el resumen del día, para guardar o mandar por WhatsApp. */
async function saveDayImage(st, title, badges, phrase) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#163563');
  bg.addColorStop(0.45, '#0c1b33');
  bg.addColorStop(1, '#08111f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  const F = 'Manrope, Arial, sans-serif';
  x.fillStyle = accentColor();
  x.beginPath();
  x.arc(140, 150, 62, 0, 7);
  x.fill();
  x.font = '64px ' + F;
  x.textAlign = 'center';
  x.fillText('🚖', 140, 172);
  x.textAlign = 'left';
  x.fillStyle = '#fff';
  x.font = '800 60px ' + F;
  x.fillText((S.cfg.ln || S.cfg.nom || 'Rutivo').toUpperCase().slice(0, 18), 230, 140);
  x.fillStyle = '#7fb0ff';
  x.font = '800 32px ' + F;
  x.fillText((S.cfg.ls || S.cfg.lic || '').slice(0, 30), 232, 188);
  x.fillStyle = '#9fb2cf';
  x.font = '600 36px ' + F;
  x.fillText(title, 80, 320);
  x.fillStyle = st.ben >= 0 ? '#3fd198' : '#ff7d6b';
  x.font = '800 150px ' + F;
  x.fillText(eur(st.ben), 76, 480);
  x.fillStyle = '#9fb2cf';
  x.font = '600 34px ' + F;
  x.fillText('de beneficio limpio', 80, 535);
  const rows = [
    ['Ingresos', eur(st.inc)], ['Gastos', eur(st.out)],
    ['Km recorridos', st.km ? kmText(st.km) : '—'], ['Beneficio por km', st.perKm !== null ? eur(st.perKm) + '/km' : '—'],
    ['Horas', st.h ? formatHours(st.h) : '—'], ['Beneficio por hora', st.perH !== null ? eur(st.perH) + '/h' : '—'],
  ];
  rows.forEach(([label, value], i) => {
    const cx = 80 + (i % 2) * 470;
    const cy = 650 + Math.floor(i / 2) * 150;
    x.fillStyle = 'rgba(255,255,255,.06)';
    x.fillRect(cx - 20, cy - 80, 440, 125);
    x.fillStyle = '#fff';
    x.font = '800 52px ' + F;
    x.fillText(value, cx, cy);
    x.fillStyle = '#9fb2cf';
    x.font = '600 30px ' + F;
    x.fillText(label, cx, cy + 36);
  });
  let y = 1110;
  x.font = '700 34px ' + F;
  for (const [cls, text] of badges.slice(0, 2)) {
    x.fillStyle = cls === 'down' ? '#ff9d8f' : cls === 'gold' ? '#f0c35a' : '#3fd198';
    x.fillText(text, 80, y);
    y += 52;
  }
  x.fillStyle = '#fff';
  x.font = '700 32px ' + F;
  x.fillText(phrase.length > 52 ? phrase.slice(0, 50) + '…' : phrase, 80, Math.max(y + 20, 1230));

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) return;
  const filename = 'jornada-' + st.day + '.png';
  const result = await saveFile(blob, filename, 'image/png');
  if (result === 'unavailable') downloadBlob(blob, filename);
  if (result !== 'cancelled') toast('Imagen del día lista ✓');
}

export function initJornada(rerender) {
  rerenderAll = rerender;
}
