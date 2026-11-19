// Pantalla "Facturas": datos del emisor, logo, emisión de facturas, PDF y copia de seguridad.
import { $, $$, confirmTap, confirmTapTimed, disarm, downloadBlob, loadScript, onClick, saveFile, toast } from '../dom.js';
import { COLORS, ICON_NAMES, ICONS, accentColor, iconSvg, logoSvg } from '../logo.js';
import { baseOf, invoiceTotals, nextInvoiceNumber } from '../money.js';
import { S, exportBackup, importBackup, markBackupDone, save } from '../store.js';
import { esc, eur, fd, r2, slug, today, uid } from '../utils.js';

const HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const A4_PX = 794; // ancho de A4 a 96 ppp

let rerenderAll = () => {};
let currentInvoice = null;

const lastIssued = () => (S.cfg.ult === undefined ? 0 : S.cfg.ult);

// ---------- marca (cabecera de la app) ----------

export function renderBrand() {
  $('#brand').innerHTML = logoSvg(190, 'var(--ink)');
  $('#lpv').innerHTML = logoSvg(220, 'var(--ink)');
  const color = accentColor();
  document.documentElement.style.setProperty('--acc', color);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = color;

  $('#wl').innerHTML = S.cfg.nom
    ? ''
    : '<div class="card"><b>Bienvenido a Rutivo</b>' +
      '<div class="mut" style="margin:6px 0">Empieza eligiendo tu icono y escribiendo tus datos de facturación.</div>' +
      '<button id="gofa" style="margin-top:6px">Poner mis datos</button></div>';
}

// ---------- editor de logo ----------

function renderLogoEditor() {
  const color = accentColor();
  const icon = S.cfg.ico || 'taxi';
  const type = S.cfg.lt || 'icono';
  $('#lt').value = type;
  $('#lf').value = S.cfg.lf || 'circulo';
  $('#ln').value = S.cfg.ln || '';
  $('#lsub').value = S.cfg.ls || '';
  $('#l3').value = S.cfg.l3 || '';
  $('#icobox').style.display = type === 'icono' ? 'block' : 'none';
  $('#imgbox').style.display = type === 'imagen' ? 'block' : 'none';
  $('#lpv').innerHTML = logoSvg(220, 'var(--ink)');

  $('#icg').innerHTML = Object.keys(ICONS)
    .map(
      (k) =>
        '<button type="button" data-ic="' + k + '" aria-label="' + ICON_NAMES[k] + '"' + (icon === k ? ' class="on"' : '') + '>' +
        '<svg viewBox="0 0 90 90" width="100%"><circle cx="45" cy="45" r="40" fill="' + color + '"/>' + iconSvg(k, color) + '</svg></button>',
    )
    .join('');
  $('#cog').innerHTML = Object.keys(COLORS)
    .map(
      (k) =>
        '<button type="button" data-co="' + k + '" aria-label="' + k + '" style="background:' + COLORS[k] + '"' +
        ((S.cfg.col || 'azul') === k ? ' class="on"' : '') + '></button>',
    )
    .join('');
}

/** Reduce el logo subido a 256 px; PNG si cabe, si no JPEG. */
const shrinkLogo = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL('image/png');
        if (url.length > 180000) url = c.toDataURL('image/jpeg', 0.8);
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

// ---------- datos del emisor ----------

const ISSUER_FIELDS = {
  // id del campo → clave en cfg
  en: 'nom', enif: 'nif', ed: 'dir', ecp: 'cp', eloc: 'loc', eib: 'iban',
  lic: 'lic', echof: 'chof', epunto: 'punto', ln: 'ln', lsub: 'ls', l3: 'l3', egest: 'gestor',
};

function renderIssuer() {
  for (const [id, key] of Object.entries(ISSUER_FIELDS)) {
    if (!['ln', 'lsub', 'l3'].includes(id)) $('#' + id).value = S.cfg[key] || '';
  }
  $('#iva').value = S.cfg.iva;
  $('#eul').value = lastIssued();
  renderLogoEditor();
}

function readIssuer() {
  const cfg = { ...S.cfg };
  for (const [id, key] of Object.entries(ISSUER_FIELDS)) cfg[key] = $('#' + id).value;
  cfg.iva = +$('#iva').value || 0;
  S.cfg = cfg;
  save();
  renderBrand();
}

// ---------- emisión ----------

function renderPending() {
  const client = $('#fc').value;
  const list = S.srv.filter((s) => !s.fid && s.cl === client);
  const known = S.cli[client] || {};
  $('#cnif').value = known.nif || '';
  $('#cdir').value = known.dir || '';
  $('#cd').style.display = client ? 'block' : 'none';
  $('#mk').style.display = client ? 'block' : 'none';
  $('#pk').innerHTML = list.length
    ? list
        .map(
          (s) =>
            '<label class="chk"><input type="checkbox" class="pick" value="' + esc(s.id) + '" checked><span>' +
            fd(s.f) + ' · ' + esc(s.o) + ' a ' + esc(s.d) +
            '<small class="mut">' + eur(s.i) + (s.n ? ' · ' + esc(s.n) : '') + '</small></span></label>',
        )
        .join('')
    : '<span class="mut">Cuando registres servicios en Transfer, aparecerán aquí.</span>';
}

function renderInvoices() {
  const clients = [...new Set(S.srv.filter((s) => !s.fid).map((s) => s.cl))];
  const select = $('#fc');
  const current = select.value;
  select.innerHTML = clients.length
    ? clients.map((x) => '<option>' + esc(x) + '</option>').join('')
    : '<option value="">Sin servicios pendientes</option>';
  if (clients.includes(current)) select.value = current;
  renderPending();

  $('#lfac').innerHTML = S.fac.length
    ? [...S.fac]
        .reverse()
        .map(
          (f) =>
            '<div class="it" data-of="' + esc(f.id) + '"><div><b>' + esc(f.num) + '</b><small>' + esc(f.cl.nom) + ' · ' + fd(f.fecha) + '</small></div>' +
            '<div><b>' + eur(invoiceTotals(f).t) + '</b><button class="x" data-df="' + esc(f.id) + '" aria-label="Borrar factura">×</button></div></div>',
        )
        .join('')
    : '<span class="mut">Todavía no has emitido facturas.</span>';
}

function createInvoice() {
  const ids = $$('.pick:checked').map((x) => x.value);
  if (!ids.length) {
    toast('Marca al menos un servicio para facturar.');
    return;
  }
  const client = $('#fc').value;
  const nif = $('#cnif').value;
  const dir = $('#cdir').value;
  S.cli[client] = { nif, dir };

  const invoice = {
    id: uid(),
    num: nextInvoiceNumber(lastIssued(), S.fac),
    fecha: today(),
    iva: S.cfg.iva,
    em: { ...S.cfg },
    cl: { nom: client, nif, dir },
    items: S.srv.filter((s) => ids.includes(s.id)).map((s) => ({ f: s.f, h: s.h, o: s.o, d: s.d, i: s.i, p: s.p, n: s.n })),
  };
  S.srv.forEach((s) => {
    if (ids.includes(s.id)) s.fid = invoice.id;
  });
  S.fac.push(invoice);
  save();
  rerenderAll();
  showInvoice(invoice);
}

function deleteInvoice(button) {
  if (!confirmTap(button, '¿Borrar?', 'Toca otra vez para borrar la factura.')) return;
  const f = S.fac.find((x) => x.id === button.dataset.df);
  if (!f) return;
  S.fac = S.fac.filter((x) => x !== f);
  S.srv.forEach((s) => {
    if (s.fid === f.id) delete s.fid;
  });
  save();
  rerenderAll();
  toast('Factura borrada. Sus servicios vuelven a Sin facturar.');
}

// ---------- hoja de factura ----------

const formatIban = (iban) => iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();

function fitSheet() {
  $('#sheet').style.zoom = Math.min(1, (innerWidth - 24) / A4_PX);
}

function showInvoice(f) {
  currentInvoice = f;
  const totals = invoiceTotals(f);
  const iva = f.iva;
  // Los datos actuales del emisor y del cliente prevalecen sobre los guardados.
  const em = { ...f.em, ...S.cfg };
  const cl = { ...f.cl, ...(S.cli[f.cl.nom] || {}) };
  const lic = em.lic || '';
  const place = [em.cp ? 'CP ' + em.cp : '', em.loc].filter(Boolean).join(' · ');

  const rows = f.items
    .map((item) => {
      const base = baseOf(item.i, iva);
      return (
        '<tr><td>' + fd(item.f) + '</td>' +
        '<td><b>Servicio Transfer' + (lic ? ' ' + esc(lic) : '') + ' – ' + esc(item.d) + '</b><br>' +
        '<small>Recogida en ' + esc(item.o) + (item.h ? ', ' + esc(item.h) + ' h' : '') + (item.n ? ' · ' + esc(item.n) : '') + '</small></td>' +
        '<td class="r">' + eur(base) + '</td><td class="r">' + eur(r2(item.i - base)) + '</td><td class="r">' + eur(item.i) + '</td></tr>'
      );
    })
    .join('');

  $('#sheet').innerHTML =
    '<div class="hd">' + logoSvg(170, '#14202b') +
    '<div class="em"><div><b>' + esc(em.nom) + '</b></div>' +
    '<div><small>NIF</small> ' + esc(em.nif) + (lic ? ' · <small>Licencia</small> <span class="nw">' + esc(lic) + '</span>' : '') + '</div>' +
    (em.dir ? '<div>' + esc(em.dir) + '</div>' : '') +
    (place ? '<div>' + esc(place) + '</div>' : '') +
    '</div></div>' +
    '<h3>Factura</h3>' +
    '<div class="meta">' +
    '<div class="box"><small>Cliente</small><b>' + esc(cl.nom) + '</b><br>NIF: ' + esc(cl.nif) + '<br>' + esc(cl.dir) + '</div>' +
    '<div class="box"><small>Datos de la factura</small>Número: <b>' + esc(f.num) + '</b><br>Fecha de emisión: ' + fd(f.fecha) + '</div>' +
    '</div>' +
    '<table><tr><th>Fecha</th><th>Concepto</th><th class="r">Base</th><th class="r">IVA ' + esc(iva) + '%</th><th class="r">Total</th></tr>' + rows + '</table>' +
    '<div class="tot">' +
    '<div><span>Base imponible</span><span>' + eur(totals.b) + '</span></div>' +
    '<div><span>IVA (' + esc(iva) + '%)</span><span>' + eur(totals.v) + '</span></div>' +
    '<div class="g"><span>Total factura</span><span>' + eur(totals.t) + '</span></div></div>' +
    '<div class="ft"><div><div>' + esc(em.nom) + (lic ? ' · Licencia ' + esc(lic) : '') + (em.loc ? ' · ' + esc(em.loc) : '') + '</div>' +
    (em.iban ? '<div>Número de cuenta (IBAN): <b class="nw">' + esc(formatIban(em.iban)) + '</b></div>' : '') +
    '</div><span>Factura ' + esc(f.num) + '</span></div>';

  $('#invwrap').classList.add('on');
  fitSheet();
}

/** Renderiza la hoja de factura a PDF A4 (carga las librerías al usarlo). */
async function invoicePdf() {
  await loadScript(HTML2CANVAS);
  await loadScript(JSPDF);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + A4_PX + 'px;background:#fff';
  const sheet = $('#sheet').cloneNode(true);
  sheet.removeAttribute('id');
  Object.assign(sheet.style, { zoom: '1', boxShadow: 'none', margin: '0', width: A4_PX + 'px', minHeight: '1123px' });
  box.appendChild(sheet);
  document.body.appendChild(box);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await window.html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true, width: A4_PX, windowWidth: A4_PX });
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = 210;
    const pageH = 297;
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(img, 'JPEG', 0, 0, pageW, imgH);
    for (let y = pageH; imgH - y > 2; y += pageH) {
      pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, -y, pageW, imgH);
    }
    return pdf.output('blob');
  } finally {
    box.remove();
  }
}

async function exportPdf() {
  const button = $('#pr');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparando PDF…';
  try {
    const blob = await invoicePdf();
    const f = currentInvoice;
    const filename = 'Factura-' + (f ? f.num : '') + (f && f.cl && f.cl.nom ? '-' + slug(f.cl.nom) : '') + '.pdf';
    const result = await saveFile(blob, filename, 'application/pdf');
    if (result === 'saved') toast('PDF listo ✓');
    if (result === 'unavailable') downloadBlob(blob, filename);
  } catch {
    toast('No se pudo crear el PDF. Revisa la conexión e inténtalo otra vez.');
  }
  button.disabled = false;
  button.textContent = label;
}

// ---------- copia de seguridad ----------

async function copyBackup() {
  const text = exportBackup();
  $('#bk').value = text;
  $('#bk').select();
  markBackupDone();
  try {
    await navigator.clipboard.writeText(text);
    toast('Copia hecha. Pégala donde quieras restaurarla.');
  } catch {
    toast('Mantén pulsado el texto de la caja, elige Copiar y pégalo en el otro sitio.');
  }
}

const isValidBackup = (text) => {
  try {
    const d = JSON.parse(text.trim());
    return !!(d && d.mov && d.srv && d.cfg);
  } catch {
    return false;
  }
};

function applyBackup(text) {
  const ok = importBackup(text);
  rerenderAll();
  toast(ok ? 'Datos restaurados.' : 'Se restauraron, pero no se pudieron guardar en este dispositivo.');
}

function restoreBackup() {
  const text = $('#bk').value;
  if (!isValidBackup(text)) {
    toast('La copia no es válida. Pégala completa en la caja.');
    return;
  }
  if (!confirmTapTimed($('#bkr'), 'Toca otra vez para confirmar', 'Esto sustituye los datos de este dispositivo.')) return;
  applyBackup(text);
}

/** Guarda la copia como archivo .json (compartir en el móvil o descarga). */
export async function saveBackupFile() {
  const blob = new Blob([exportBackup()], { type: 'application/json' });
  const filename = 'rutivo-copia-' + today() + '.json';
  const result = await saveFile(blob, filename, 'application/json');
  if (result === 'cancelled') return;
  if (result === 'unavailable') downloadBlob(blob, filename);
  markBackupDone();
  rerenderAll();
  toast('Copia guardada ✓ Guárdala en un sitio seguro.');
}

let pendingRestore = null; // texto del archivo elegido, a la espera de confirmar

function restoreFromFile() {
  const button = $('#bko');
  if (pendingRestore && button.dataset.arm === '1') {
    disarm(button);
    const text = pendingRestore;
    pendingRestore = null;
    applyBackup(text);
    return;
  }
  $('#bkfile').click();
}

async function fileChosen() {
  const file = $('#bkfile').files[0];
  $('#bkfile').value = '';
  if (!file) return;
  const text = await file.text();
  if (!isValidBackup(text)) {
    toast('Ese archivo no es una copia de Rutivo.');
    return;
  }
  pendingRestore = text;
  confirmTapTimed($('#bko'), 'Toca otra vez para restaurar (sustituye tus datos)', 'Esto sustituye los datos actuales por los de la copia.', 10000);
  setTimeout(() => (pendingRestore = null), 10000);
}

// ---------- arranque ----------

export function renderFacturas() {
  renderIssuer();
  renderInvoices();
}

export function initFacturas(rerender) {
  rerenderAll = rerender;

  for (const id of [...Object.keys(ISSUER_FIELDS), 'iva']) $('#' + id).oninput = readIssuer;
  $('#eul').oninput = () => {
    S.cfg.ult = +$('#eul').value || 0;
    save();
  };

  $('#lt').onchange = () => {
    S.cfg.lt = $('#lt').value;
    save();
    renderBrand();
    renderLogoEditor();
  };
  $('#lf').onchange = () => {
    S.cfg.lf = $('#lf').value;
    save();
    renderBrand();
  };
  $('#lim').onchange = async () => {
    const file = $('#lim').files[0];
    if (!file) return;
    try {
      S.cfg.limg = await shrinkLogo(file);
      S.cfg.lt = 'imagen';
      save();
      renderBrand();
      renderLogoEditor();
      toast('Imagen guardada ✓');
    } catch {
      toast('No se pudo leer la imagen.');
    }
    $('#lim').value = '';
  };
  $('#lreset').onclick = () => {
    if (!confirmTapTimed($('#lreset'), 'Toca otra vez para volver al logo por defecto')) return;
    for (const k of ['lt', 'ico', 'col', 'lf', 'ln', 'ls', 'l3', 'limg']) delete S.cfg[k];
    save();
    renderBrand();
    renderLogoEditor();
    toast('Logo por defecto restablecido ✓');
  };
  $('#limx').onclick = () => {
    delete S.cfg.limg;
    save();
    renderBrand();
    toast('Imagen quitada.');
  };
  onClick('[data-ic],[data-co]', (el) => {
    if (el.dataset.ic) S.cfg.ico = el.dataset.ic;
    if (el.dataset.co) S.cfg.col = el.dataset.co;
    save();
    renderBrand();
    renderLogoEditor();
  });
  onClick('#gofa', () => {
    document.querySelector('.tabs button[data-v=fa]').click();
    $('#emisor').open = true;
  });

  $('#fc').onchange = renderPending;
  $('#mk').onclick = createInvoice;
  onClick('[data-df]', deleteInvoice);
  onClick('[data-of]', (el, e) => {
    if (e.target.closest('[data-df]')) return; // el botón de borrar no abre la factura
    const f = S.fac.find((x) => x.id === el.dataset.of);
    if (f) showInvoice(f);
  });
  $('#cl').onclick = () => $('#invwrap').classList.remove('on');
  $('#pr').onclick = exportPdf;
  addEventListener('resize', fitSheet);

  $('#bkc').onclick = copyBackup;
  $('#bkr').onclick = restoreBackup;
  $('#bkf').onclick = saveBackupFile;
  $('#bko').onclick = restoreFromFile;
  $('#bkfile').onchange = fileChosen;
}
