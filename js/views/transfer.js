// Pantalla "Transfer": servicios, proveedores, mensaje de bienvenida y cartel.
import { parseAgencyService } from '../agency.js';
import { $, confirmTap, confirmTapTimed, onClick, saveFile, toast } from '../dom.js';
import { S, save } from '../store.js';
import { cap, esc, eur, fd, slug, today, uid } from '../utils.js';
import { DEFAULT_WELCOME_EN, DEFAULT_WELCOME_ES, welcomeMessage, welcomeSendTime } from '../welcome.js';

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

/** Botones de cartel, vuelo y bienvenida de un servicio. */
function serviceActions(s) {
  if (!s.pa && !s.vu) return '';
  let html = '<div>';
  if (s.pa) html += '<button class="small-btn sec" data-ct="' + esc(s.id) + '">Cartel</button>';
  if (s.vu) {
    const flight = encodeURIComponent(s.vu.toLowerCase().replace(/\s/g, ''));
    html += '<a class="small-btn" target="_blank" rel="noopener noreferrer" href="https://www.flightradar24.com/data/flights/' + flight + '">Ver vuelo</a>';
  }
  if (s.tl) {
    const when = welcomeSendTime(s.sv);
    const href = 'https://wa.me/' + s.tl.replace(/\D/g, '') + '?text=' + encodeURIComponent(welcomeMessage(s, S.cfg));
    html += '<a class="small-btn" target="_blank" rel="noopener noreferrer" href="' + esc(href) + '">Bienvenida' + (when ? ' (' + when + ')' : '') + '</a>';
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
            '<span class="tag">' + esc(cap(s.p)) + '</span>' + serviceActions(s) +
            '</div><div><b>' + eur(s.i) + '</b>' +
            (s.fid ? '' : '<button class="x" data-ds="' + esc(s.id) + '" aria-label="Borrar">×</button>') +
            '</div></div>',
        )
        .join('')
    : '<span class="mut">Aún no hay servicios. Registra el primero arriba.</span>';
}

function fillFromAgency() {
  const data = parseAgencyService($('#agt').value);
  if (!data) {
    toast('No encuentro los datos. Pega el servicio completo.');
    return;
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
  $('#wpv').textContent = welcomeMessage(SAMPLE_SERVICE, S.cfg);
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
  $('#fs').onsubmit = saveService;
  $('#fp').onsubmit = saveProvider;
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
  onClick('[data-ep]', (el) => editProvider(el.dataset.ep));
  onClick('[data-dp]', (el) => deleteProvider(el));
  onClick('[data-ct]', (el) => {
    const s = S.srv.find((x) => x.id === el.dataset.ct);
    if (s) showSign(s);
  });
}
