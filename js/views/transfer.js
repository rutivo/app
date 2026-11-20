// Pantalla "Transfer": servicios, proveedores, mensaje de bienvenida y cartel.
import { readFileText } from '../ocr.js';
import { readProvider } from '../providerReader.js';
import { readService } from '../serviceReader.js';
import { $, bottomSheet, confirmTap, confirmTapTimed, onClick, saveFile, toast } from '../dom.js';
import { openFlight } from '../flight.js';
import { openWelcome } from './bienvenida.js';
import { mapsUrl } from '../trips.js';
import { S, save } from '../store.js';
import { cap, esc, eur, fd, slug, today, uid } from '../utils.js';
import { DEFAULT_WELCOME_EN, DEFAULT_WELCOME_ES, buildWelcome, welcomeSendTime } from '../welcome.js';
import { openWorth } from './compensa.js';

let rerenderAll = () => {};
let editingProviderId = null;

// ---------- servicios ----------

function renderProviderSelect() {
  const select = $('#sc');
  const current = select.value;
  const names = [...new Set([...S.prv.map((p) => p.nom), ...S.srv.map((s) => s.cl)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="">Elegir proveedor…</option>' + names.map((c) => '<option>' + esc(c) + '</option>').join('');
  select.value = names.includes(current) ? current : '';
}

/** Botones de cada servicio: llevarme, cartel, vuelo y bienvenida. */
function serviceActions(s) {
  const id = esc(s.id);
  let html = '<div>';
  html += '<button class="small-btn sec" data-go="' + id + '">📍 Llevarme</button>';
  if (s.pa) html += '<button class="small-btn sec" data-ct="' + id + '">Cartel</button>';
  if (s.vu) html += '<button class="small-btn sec" data-fl="' + id + '">✈️ Vuelo</button>';
  if (s.tl || s.pa) {
    const when = welcomeSendTime(s.sv);
    html += '<button class="small-btn" data-wm="' + id + '">💬 Bienvenida' + (when ? ' (' + when + ')' : '') + '</button>';
  }
  return html + '</div>';
}

function renderServices() {
  renderProviderSelect();
  const list = [...S.srv].sort((a, b) => (b.f + b.h).localeCompare(a.f + a.h));
  $('#ls').innerHTML = list.length
    ? list
        .map(
          (s) =>
            '<div class="it"><div>' + esc(s.cl) +
            '<small>' + fd(s.f) + ' ' + esc(s.h) + ' · ' + esc(s.o) + ' a ' + esc(s.d) + '</small>' +
            '<span class="tag' + (s.fid ? ' ok' : '') + '">' + (s.fid ? 'Facturado' : 'Sin facturar') + '</span> ' +
            '<span class="tag pay ' + (s.p === 'pendiente' ? 'pend' : 'paid') + '" role="button" data-pay="' + esc(s.id) + '">' +
            (s.p === 'pendiente' ? 'Pendiente de cobro' : 'Cobrado: ' + esc(s.p)) + ' ▾</span>' + serviceActions(s) +
            '</div><div><b>' + eur(s.i) + '</b>' +
            (s.fid ? '' : '<button class="x" data-ds="' + esc(s.id) + '" aria-label="Borrar">×</button>') +
            '</div></div>',
        )
        .join('')
    : '<span class="mut">Aún no hay servicios. Registra el primero arriba.</span>';
}

function fillFromAgency() {
  const data = readService($('#agt').value, today());
  if (!data) {
    toast('No encuentro la fecha ni la hora. Revisa el texto o pega el servicio completo.');
    return false;
  }
  $('#sf').value = data.date;
  $('#sh').value = data.time;
  $('#so').value = data.origin;
  $('#sd').value = data.destination;
  $('#si').value = data.amount || '';
  $('#sp').value = 'pendiente';
  $('#sn').value = data.notes;
  $('#spa').value = data.passenger;
  $('#svu').value = data.flight;
  $('#stl').value = data.phone;
  $('#sc').value = '';
  $('#sc').focus();
  toast('Servicio leído. Elige el proveedor, revisa el importe y guarda.');
  return true;
}

/** Foto de los datos de un proveedor (membrete, factura, tarjeta): rellenar el formulario. */
async function readProviderFile(file) {
  const status = (s) => ($('#pocr').textContent = s);
  try {
    const text = await readFileText(file, status);
    const p = readProvider(text);
    if (!p) { status('No encuentro nombre, CIF ni dirección en la foto. Prueba con otra más nítida.'); return; }
    const set = (id, v) => { if (v) $('#' + id).value = v; };
    set('pn', p.nom); set('pnif', p.nif); set('pd', p.dir); set('pcp', p.cp); set('pl2', p.loc);
    status('✓ Datos leídos de la foto. Revísalos y toca «Guardar proveedor».');
    $('#pn').scrollIntoView({ block: 'center' });
  } catch {
    status('No se pudo leer la foto (¿sin internet la primera vez?). Prueba otra vez.');
  }
}

/** Foto, captura, vídeo o PDF de un servicio (de cualquier app): leer el texto y rellenar. */
async function readServiceFile(file) {
  const status = (s) => ($('#agocr').textContent = s);
  try {
    const text = await readFileText(file, status);
    if (!text.trim()) { status('No he encontrado texto. Prueba con una captura más nítida.'); return; }
    $('#agt').value = text;
    status(fillFromAgency() ? '✓ Leído de la ' + (file.type.startsWith('video/') ? 'grabación' : 'imagen') + '. Revisa los datos (el texto leído está arriba).'
      : 'He leído el texto (arriba), pero no encuentro la fecha ni la hora. Corrígelo y toca «Leer servicio».');
  } catch {
    status('No se pudo leer el archivo (¿sin internet la primera vez?). Prueba otra vez o pega el texto.');
  }
}

function saveService(e) {
  e.preventDefault();
  const v = (id) => $('#' + id).value.trim();
  const s = {
    id: uid(), f: $('#sf').value, h: $('#sh').value, cl: v('sc'), o: v('so'), d: v('sd'),
    i: +$('#si').value, p: $('#sp').value, n: v('sn'),
    pa: v('spa'), vu: v('svu'), sv: $('#ssv').value, tl: v('stl'),
  };
  // Un servicio ya cobrado también entra en la caja del día.
  if (s.p !== 'pendiente') {
    s.mid = uid();
    S.mov.push({ id: s.mid, f: s.f, t: 'in', p: s.p, i: s.i, c: 'Transfer: ' + s.cl });
  }
  S.srv.push(s);
  save();
  ['si', 'so', 'sd', 'sn', 'sh', 'spa', 'svu', 'ssv', 'stl', 'agt'].forEach((id) => ($('#' + id).value = ''));
  rerenderAll();
}

function deleteService(id) {
  const s = S.srv.find((x) => x.id === id);
  if (!s) return;
  S.srv = S.srv.filter((x) => x.id !== id);
  if (s.mid) S.mov = S.mov.filter((m) => m.id !== s.mid);
  save();
  rerenderAll();
}

/**
 * Cambia cómo se cobró un servicio ya guardado. Al cobrarlo entra en la caja
 * de hoy; al volver a "pendiente" sale de la caja.
 */
function setPayment(s, method) {
  if (s.p === method) return;
  const movement = s.mid && S.mov.find((m) => m.id === s.mid);
  if (method === 'pendiente') {
    if (s.mid) S.mov = S.mov.filter((m) => m.id !== s.mid);
    delete s.mid;
  } else if (movement) {
    movement.p = method;
  } else {
    s.mid = uid();
    S.mov.push({ id: s.mid, f: today(), t: 'in', p: method, i: s.i, c: 'Transfer: ' + s.cl });
  }
  s.p = method;
  save();
  rerenderAll();
  toast(method === 'pendiente' ? 'Marcado como pendiente de cobro.' : 'Cobrado en ' + method + ' ✓ Añadido a la caja de hoy.');
}

function choosePayment(s) {
  const sheet = document.createElement('div');
  sheet.className = 'pay-sheet';
  const option = (method, label) =>
    '<button type="button" data-set="' + method + '"' + (s.p === method ? ' class="sec" disabled' : '') + '>' + label + (s.p === method ? ' ✓' : '') + '</button>';
  sheet.innerHTML =
    '<div><b>¿Cómo se ha pagado?</b><div class="mut mt8">' + esc(s.cl) + ' · ' + fd(s.f) + ' · ' + eur(s.i) + '</div>' +
    option('efectivo', '💶 Cobrado en efectivo') + option('tarjeta', '💳 Cobrado con tarjeta') + option('pendiente', '⏳ Pendiente de cobro') +
    '<button type="button" class="sec" data-set="">Cancelar</button></div>';
  sheet.onclick = (e) => {
    const b = e.target.closest('[data-set]');
    if (e.target !== sheet && !b) return;
    if (b && b.dataset.set) setPayment(s, b.dataset.set);
    sheet.remove();
  };
  document.body.appendChild(sheet);
}

/** Panel para abrir Google Maps hacia la recogida o el destino. */
export function chooseRoute(s) {
  const link = (place, icon, label) =>
    place ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + esc(mapsUrl(place)) + '" data-close>' + icon + ' ' + label + '<small>' + esc(place) + '</small></a>' : '';
  bottomSheet(
    '<h3>📍 Llevarme</h3><div class="mut">Se abre Google Maps con la ruta en coche.</div>' +
    link(s.o, '🧍', 'A la recogida') + link(s.d, '🏁', 'Al destino') +
    '<button type="button" class="sec" data-close>Cancelar</button>',
  );
}

function deleteAllServices(button) {
  if (!S.srv.length) {
    toast('No hay servicios que borrar.');
    return;
  }
  if (!confirmTapTimed(button, 'Toca otra vez: se borran ' + S.srv.length + ' servicios')) return;
  const linked = new Set(S.srv.map((s) => s.mid).filter(Boolean));
  S.mov = S.mov.filter((m) => !linked.has(m.id));
  S.srv = [];
  save();
  rerenderAll();
  toast('Servicios borrados.');
}

// ---------- proveedores ----------

const providerAddress = (p) => [p.dir, [p.cp, p.loc].filter(Boolean).join(' ')].filter(Boolean).join(', ');

function renderProviders() {
  const sorted = [...S.prv].sort((a, b) => a.nom.localeCompare(b.nom));
  $('#plist').innerHTML = sorted.length
    ? sorted
        .map((p) => {
          const addr = providerAddress(p);
          return (
            '<div class="it"><div><b>' + esc(p.nom) + '</b><small>' + esc(p.nif || '') + (addr ? ' · ' + esc(addr) : '') + '</small></div>' +
            '<div><button class="x" data-ep="' + esc(p.id) + '" aria-label="Editar">✎</button>' +
            '<button class="x" data-dp="' + esc(p.id) + '" aria-label="Borrar">×</button></div></div>'
          );
        })
        .join('')
    : '<span class="mut">Aún no has añadido proveedores.</span>';
  $('#pt').textContent = 'Proveedores (' + S.prv.length + ')';
}

function saveProvider(e) {
  e.preventDefault();
  const v = (id) => $('#' + id).value.trim();
  const p = { id: editingProviderId || uid(), nom: v('pn'), nif: v('pnif'), dir: v('pd'), cp: v('pcp'), loc: v('pl2') };
  if (!p.nom) return;

  if (editingProviderId) {
    const old = S.prv.find((x) => x.id === editingProviderId);
    if (old && old.nom !== p.nom) {
      // Renombrar: los servicios del proveedor pasan al nombre nuevo.
      S.srv.forEach((s) => {
        if (s.cl === old.nom) s.cl = p.nom;
      });
      delete S.cli[old.nom];
    }
    S.prv = S.prv.map((x) => (x.id === editingProviderId ? p : x));
  } else {
    S.prv.push(p);
  }
  S.cli[p.nom] = { nif: p.nif, dir: providerAddress(p) };
  editingProviderId = null;
  e.target.reset();
  $('#pb').textContent = 'Guardar proveedor';
  save();
  rerenderAll();
  toast('Proveedor guardado ✓');
}

function editProvider(id) {
  const p = S.prv.find((x) => x.id === id);
  if (!p) return;
  editingProviderId = p.id;
  $('#pn').value = p.nom;
  $('#pnif').value = p.nif || '';
  $('#pd').value = p.dir || '';
  $('#pcp').value = p.cp || '';
  $('#pl2').value = p.loc || '';
  $('#pb').textContent = 'Actualizar proveedor';
  $('#pn').scrollIntoView({ block: 'center' });
}

function deleteProvider(button) {
  if (!confirmTap(button, '¿Borrar?', 'Toca otra vez para borrar el proveedor.')) return;
  S.prv = S.prv.filter((x) => x.id !== button.dataset.dp);
  save();
  rerenderAll();
  toast('Proveedor borrado.');
}

// ---------- mensaje de bienvenida ----------

const SAMPLE_SERVICE = { pa: 'Heidi Sachmann', vu: 'D85071', sv: '14:00', d: 'Elviria', f: '2026-10-27', h: '15:30' };

function renderWelcomePreview() {
  $('#wpv').textContent = buildWelcome(SAMPLE_SERVICE, S.cfg, { preset: 'mio', lang: 'ambos' });
}

function renderWelcome() {
  // No pisar lo que el usuario está escribiendo.
  if (document.activeElement && ['wen', 'wes'].includes(document.activeElement.id)) return;
  $('#wen').value = S.cfg.wen === undefined ? DEFAULT_WELCOME_EN : S.cfg.wen;
  $('#wes').value = S.cfg.wes === undefined ? DEFAULT_WELCOME_ES : S.cfg.wes;
  renderWelcomePreview();
}

// ---------- cartel del pasajero ----------

function showSign(s) {
  const overlay = document.createElement('div');
  overlay.className = 'cartel';
  overlay.innerHTML =
    '<span class="cartel-name"></span>' +
    '<div class="cartel-bar"><button>✕</button><button>Pantalla completa</button><button>Guardar imagen</button></div>';
  const name = overlay.querySelector('.cartel-name');
  name.textContent = s.pa;
  document.body.appendChild(overlay);

  // Ajustar el tamaño de letra para ocupar casi toda la pantalla.
  const r = name.getBoundingClientRect();
  name.style.fontSize = 100 * Math.min((innerHeight * 0.9) / r.height, (innerWidth * 0.9) / r.width) + 'px';

  let wakeLock = null;
  try {
    navigator.wakeLock.request('screen').then((l) => (wakeLock = l)).catch(() => {});
  } catch {
    /* sin Wake Lock */
  }
  const exitFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
    } catch {
      /* ignorar */
    }
  };

  const [close, full, image] = overlay.querySelectorAll('button');
  close.onclick = () => {
    overlay.remove();
    try {
      if (wakeLock) wakeLock.release();
    } catch {
      /* ignorar */
    }
    exitFullscreen();
  };
  full.onclick = () => {
    const request = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (!request) {
      signImage(s);
      return;
    }
    try {
      const p = request.call(overlay);
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* ignorar */
    }
  };
  image.onclick = () => {
    exitFullscreen();
    signImage(s);
  };
}

/** Genera el cartel como imagen vertical de móvil y la ofrece para guardar. */
async function signImage(s) {
  const W = 1080;
  const H = 2340;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  ctx.font = '900 100px Georgia,serif';
  const m1 = ctx.measureText(s.pa);
  const len = m1.actualBoundingBoxLeft + m1.actualBoundingBoxRight;
  const tall = m1.actualBoundingBoxAscent + m1.actualBoundingBoxDescent;
  const size = 100 * Math.min((H * 0.88) / len, (W * 0.84) / tall);
  ctx.font = '900 ' + size + 'px Georgia,serif';
  const m2 = ctx.measureText(s.pa);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(
    s.pa,
    (m2.actualBoundingBoxLeft - m2.actualBoundingBoxRight) / 2,
    (m2.actualBoundingBoxAscent - m2.actualBoundingBoxDescent) / 2,
  );

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (blob) {
    const result = await saveFile(blob, 'cartel-' + slug(s.pa) + '.png', 'image/png');
    if (result === 'saved') toast('Cartel guardado.');
    if (result !== 'unavailable') return;
  }

  // Último recurso: mostrar la imagen para guardarla a mano.
  const box = document.createElement('div');
  box.className = 'cartel-save';
  box.innerHTML = '<p>Mantén pulsada la imagen y elige Guardar en Fotos.</p><img alt="Cartel"><br><button class="mt14">Cerrar</button>';
  box.querySelector('img').src = canvas.toDataURL('image/png');
  box.querySelector('button').onclick = () => box.remove();
  document.body.appendChild(box);
}

// ---------- arranque ----------

export function renderTransfer() {
  renderWelcome();
  renderServices();
  renderProviders();
}

export function initTransfer(rerender) {
  rerenderAll = rerender;
  $('#sf').value = today();
  $('#ag').onclick = fillFromAgency;
  $('#agimg').onchange = () => {
    const f = $('#agimg').files[0];
    $('#agimg').value = '';
    if (f) readServiceFile(f);
  };
  $('#fs').onsubmit = saveService;
  $('#cmp').onclick = () => openWorth({ price: +$('#si').value || '', from: $('#so').value.trim(), to: $('#sd').value.trim() });
  $('#fp').onsubmit = saveProvider;
  $('#pimg').onchange = () => {
    const f = $('#pimg').files[0];
    $('#pimg').value = '';
    if (f) readProviderFile(f);
  };
  $('#dsa').onclick = () => deleteAllServices($('#dsa'));

  $('#wen').oninput = () => {
    S.cfg.wen = $('#wen').value;
    save();
    renderWelcomePreview();
    renderServices();
  };
  $('#wes').oninput = () => {
    S.cfg.wes = $('#wes').value;
    save();
    renderWelcomePreview();
    renderServices();
  };
  $('#wrs').onclick = () => {
    delete S.cfg.wen;
    delete S.cfg.wes;
    save();
    renderWelcome();
    renderServices();
    toast('Mensaje original restablecido.');
  };

  onClick('[data-ds]', (el) => deleteService(el.dataset.ds));
  const byId = (id) => S.srv.find((x) => x.id === id);
  onClick('[data-go]', (el) => { const s = byId(el.dataset.go); if (s) chooseRoute(s); });
  onClick('[data-fl]', (el) => {
    const s = byId(el.dataset.fl);
    if (s) openFlight(s.vu, esc(s.pa || '') + (s.pa ? ' · ' : '') + fd(s.f) + ' ' + esc(s.h), s.f, s.h);
  });
  onClick('[data-pay]', (el) => {
    const s = S.srv.find((x) => x.id === el.dataset.pay);
    if (s) choosePayment(s);
  });
  onClick('[data-ep]', (el) => editProvider(el.dataset.ep));
  onClick('[data-dp]', (el) => deleteProvider(el));
  onClick('[data-wm]', (el) => {
    const s = byId(el.dataset.wm);
    if (s) openWelcome(s);
  });
  onClick('[data-ct]', (el) => {
    const s = S.srv.find((x) => x.id === el.dataset.ct);
    if (s) showSign(s);
  });
}
