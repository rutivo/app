// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Página que ve el cliente (cliente.html): lee los datos del enlace (después de «#»)
// y consulta su vuelo. Todo el texto se pone con textContent: nada del enlace se
// interpreta como HTML. No usa cuentas, ni Firebase, ni guarda nada.
import { FIREBASE_CONFIG, FLIGHT_API } from './config.js';
import { STEP, T, decodeLink, fromRest, isLinkId, shouldAskFlight, spainClock, spainTime, stageOf } from './enlace.js';

const app = document.getElementById('app');
const REFRESH_MS = 3 * 6e4;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const fill = (s, vals) => s.replace(/\{(\w)\}/g, (m, k) => (k in vals ? vals[k] : m));

let flight = null;

async function askFlight(data) {
  if (!FLIGHT_API || !shouldAskFlight(data)) return;
  try {
    const res = await fetch(FLIGHT_API.replace(/\/$/, '') + '/flight?n=' + encodeURIComponent(data.f) + '&d=' + data.dt, { referrerPolicy: 'no-referrer' });
    if (res.ok) flight = await res.json();
  } catch {
    /* sin datos del vuelo: la página se ve igual, sin ese recuadro */
  }
}

function flightCard(data, t) {
  const card = el('section', 'card');
  card.appendChild(el('h2', null, t.flight));
  const row = el('div', 'row');
  const left = el('div');
  left.appendChild(el('div', 'big', '✈ ' + data.f));
  const f = flight && flight.found !== false ? flight : null;
  const a = f && f.arr;
  const at = a && (a.runway || a.revised || a.predicted || a.sched);
  if (at) {
    const when = fill(a.runway ? t.landedAt : t.landsAt, { t: spainClock(Date.parse(at)) }) + ' (' + t.local + ')';
    left.appendChild(el('div', 'mut', when + (a.terminal ? ' · ' + fill(t.terminal, { x: a.terminal }) : '')));
  }
  row.appendChild(left);
  if (at && a.sched) {
    const min = Math.round((Date.parse(at) - Date.parse(a.sched)) / 6e4);
    const txt = Math.abs(min) < 5 ? t.onTime : fill(min > 0 ? t.late : t.early, { m: Math.abs(min) });
    row.appendChild(el('span', min >= 5 ? 'bad' : 'ok', txt));
  }
  card.appendChild(row);
  return card;
}

/** La foto en grande, a pantalla completa (se cierra con la ✕, tocando o con Esc). */
function openPhoto(src, t) {
  const box = el('div', 'lb');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t.where);
  const img = el('img');
  img.src = src;
  img.alt = t.where;
  const x = el('button', 'lbx', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', t.close);
  const close = () => { box.remove(); document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  box.onclick = (e) => { if (e.target !== img) close(); };
  x.onclick = close;
  box.append(img, x);
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', esc);
  x.focus();
}

function render(data) {
  const t = T[data.l] || T.en;
  document.documentElement.lang = data.l;
  document.title = t.title;
  const stage = stageOf(data, flight);
  app.textContent = '';

  const top = el('header', 'top');
  top.appendChild(el('div', 'brand', data.d ? data.d + ' · ' + t.title : t.title));
  const st = el('div', 'state' + (stage === 'canceled' ? ' warn' : ''));
  st.appendChild(el('i'));
  st.appendChild(el('span', null, t[stage]));
  top.appendChild(st);
  top.appendChild(el('h1', null, data.n ? fill(t.hi, { n: data.n }) : t.hiNo));
  top.appendChild(el('p', null, t[stage + 'S']));
  if (data.f) {
    const steps = el('div', 'steps');
    t.steps.forEach((name, i) => {
      const s = el('div', i <= STEP[stage] ? 'on' : '');
      s.appendChild(el('b'));
      s.appendChild(document.createTextNode(name));
      steps.appendChild(s);
    });
    top.appendChild(steps);
  }
  app.appendChild(top);

  // Conductor y coche
  const who = el('section', 'card first');
  const dr = el('div', 'dr');
  dr.appendChild(el('div', 'av', (data.d || '🚖').charAt(0).toUpperCase()));
  const info = el('div');
  if (data.d) info.appendChild(el('b', null, data.d));
  if (data.c) info.appendChild(el('div', 'mut', data.c));
  if (data.m) info.appendChild(el('span', 'plate', data.m));
  dr.appendChild(info);
  who.appendChild(dr);
  app.appendChild(who);

  // Punto de encuentro
  if (data.p || data.ph) {
    const c = el('section', 'card');
    c.appendChild(el('h2', null, t.where));
    if (data.p) c.appendChild(el('div', 'big', '📍 ' + data.p));
    if (data.ph) {
      // En pequeño (nítida) dentro de la tarjeta; al tocarla, en grande a pantalla completa
      const btn = el('button', 'phb');
      btn.type = 'button';
      btn.setAttribute('aria-label', t.zoom);
      const img = el('img', 'ph');
      img.src = data.ph; // solo una JPEG en base64, comprobada en cleanLink
      img.alt = t.where;
      btn.append(img, el('span', 'phz', '⤢ ' + t.zoom));
      btn.onclick = () => openPhoto(data.ph, t);
      c.appendChild(btn);
    }
    app.appendChild(c);
  }

  if (data.f) app.appendChild(flightCard(data, t));

  // Recogida y trayecto
  if (data.dt || data.o || data.de) {
    const c = el('section', 'card');
    c.appendChild(el('h2', null, t.pickup));
    const ms = spainTime(data.dt, data.h);
    if (ms) {
      const day = new Date(ms).toLocaleDateString(data.l, { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' });
      c.appendChild(el('div', 'big', day + (data.h ? ' · ' + data.h : '')));
      if (data.h) c.appendChild(el('div', 'mut', '(' + t.local + ')'));
    }
    if (data.o || data.de) c.appendChild(el('div', 'mut', [data.o, data.de].filter(Boolean).join(' → ')));
    app.appendChild(c);
  }

  // Botones para escribir o llamar al conductor
  if (data.t) {
    const tel = data.t.replace(/[^\d+]/g, '');
    const b = el('div', 'btns');
    const wa = el('a', 'wa', '💬 ' + t.write);
    wa.href = 'https://wa.me/' + tel.replace(/\D/g, '');
    wa.rel = 'noopener noreferrer';
    wa.target = '_blank';
    const ca = el('a', 'ca', '📞 ' + t.call);
    ca.href = 'tel:' + tel;
    b.append(wa, ca);
    app.appendChild(b);
  }

  const foot = el('div', 'foot', t.by + ' ');
  foot.appendChild(el('b', null, 'Rutivo'));
  app.appendChild(foot);
}

/**
 * Enlace corto (#código): los datos se leen de la nube, sin cuenta, con la API REST
 * de Firestore. Las reglas solo dejan leer ESE documento y solo si no ha caducado.
 */
async function fromCloud(id) {
  if (!FIREBASE_CONFIG) return null;
  const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(FIREBASE_CONFIG.projectId) +
    '/databases/(default)/documents/enlaces/' + id + '?key=' + encodeURIComponent(FIREBASE_CONFIG.apiKey);
  try {
    const res = await fetch(url, { referrerPolicy: 'no-referrer', cache: 'no-store' });
    return res.ok ? fromRest(await res.json()) : null;
  } catch {
    return null;
  }
}

async function start() {
  // Vista previa del conductor (desde la app): barra para volver. El enlace del cliente no lleva ?vista.
  if (new URLSearchParams(location.search).has('vista')) {
    const bar = el('button', 'back', '← Volver a Rutivo');
    bar.type = 'button';
    bar.onclick = () => { if (history.length > 1) history.back(); else location.href = './'; };
    document.body.prepend(bar);
  }
  const hash = location.hash.replace(/^#/, '');
  const data = isLinkId(hash) ? await fromCloud(hash) : decodeLink(hash);
  if (!data || (!data.d && !data.p && !data.dt && !data.ph)) {
    const lang = (navigator.language || 'en').slice(0, 2);
    app.textContent = '';
    app.appendChild(el('p', 'broken', (T[lang] || T.en).broken));
    return;
  }
  render(data);
  await askFlight(data);
  render(data);
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    await askFlight(data);
    render(data);
  }, REFRESH_MS);
}

start();
