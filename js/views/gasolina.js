// Pantalla "Gasolina": facturas de combustible con foto o PDF.
import { canStorePhotoInCloud, deletePhoto, downloadPhoto, uploadPhoto } from '../cloud.js';
import { $, downloadBlob, loadScript, onClick, shareFiles, toast } from '../dom.js';
import { PERIODS, fuelBetween, packName, periodRange } from '../fuelPack.js';
import { parseFuelReceipt } from '../fuelReceipt.js';
import { S, getPhotoLocal, removePhotoLocal, save, savePhotoLocal } from '../store.js';
import { cap, esc, eur, fd, sum, today, uid } from '../utils.js';
import { fuelPdf } from './fuelPdf.js';
import { firstPageCanvas } from '../pdfLib.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TESSERACT_LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int';
let rerenderAll = () => {};

/** Reduce una imagen a 1000 px de lado mayor, en JPEG. */
const shrinkImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, 1000 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.6));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

/** Convierte la primera página de un PDF en imagen JPEG. */
async function pdfToImage(file) {
  const c = await firstPageCanvas(file, 1000);
  return c.toDataURL('image/jpeg', 0.65);
}

/** Guarda la foto en el móvil y/o en la cuenta. Devuelve true si se guardó en algún sitio. */
async function storeReceipt(id, file) {
  const dataUrl = file.type === 'application/pdf' ? await pdfToImage(file) : await shrinkImage(file);
  const local = await savePhotoLocal(id, dataUrl);
  const cloud = canStorePhotoInCloud(dataUrl);
  if (!local && !cloud) return false;
  if (cloud) uploadPhoto(id, dataUrl);
  return true;
}

/** Imagen a resolución suficiente para leer el texto (máx. 1600 px). */
const imageForOcr = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.src = url;
  });

let ocrRun = 0;

/** Lee el ticket con OCR (Tesseract, dentro del móvil) y rellena el formulario. */
async function readReceipt(file) {
  const run = ++ocrRun;
  const status = (t) => { if (run === ocrRun) $('#ocr').textContent = t; };
  status('🔎 Leyendo el ticket… (la primera vez tarda un poco más)');
  try {
    await loadScript(TESSERACT);
    const source = file.type === 'application/pdf' ? await pdfToImage(file) : await imageForOcr(file);
    const worker = await window.Tesseract.createWorker('spa', 1, { langPath: TESSERACT_LANG });
    const { data } = await worker.recognize(source);
    await worker.terminate();
    if (run !== ocrRun) return;
    const r = parseFuelReceipt(data.text);
    const found = [];
    if (r.amount) { $('#gi').value = r.amount; found.push(eur(r.amount)); }
    if (r.liters) { $('#gl').value = r.liters; found.push(String(r.liters).replace('.', ',') + ' L'); }
    if (r.station && !$('#gs').value) { $('#gs').value = r.station; found.push(r.station); }
    if (r.date) { $('#gf').value = r.date; found.push(fd(r.date)); }
    status(found.length ? '✓ Leído: ' + found.join(' · ') + '. Revísalo antes de guardar.' : 'No he podido leer los datos. Escríbelos a mano.');
  } catch {
    status('No se pudo leer el ticket (¿sin conexión?). Escribe los datos a mano.');
  }
}

export function renderGasolina() {
  const list = [...S.gas].sort((a, b) => b.f.localeCompare(a.f));
  const month = list.filter((g) => g.f.startsWith(today().slice(0, 7)));

  $('#gres').innerHTML =
    '<div class="mut">Gasolina de este mes</div>' +
    '<div class="big">' + eur(sum(month, (g) => g.i)) + '</div>' +
    '<div class="mut">' + month.length + ' facturas · ' + sum(month, (g) => g.l).toFixed(1) + ' litros</div>';

  $('#lg').innerHTML = list.length
    ? list
        .map(
          (g) =>
            '<div class="it"><div>' + (g.s ? esc(g.s) : 'Gasolinera') +
            '<small>' + fd(g.f) + (g.l ? ' · ' + g.l + ' L' : '') + ' · ' + esc(cap(g.p)) + '</small>' +
            (g.ph ? '<button class="sec small-btn" data-ph="' + esc(g.id) + '">Ver factura</button>' : '') +
            '</div><div><b>' + eur(g.i) + '</b><button class="x" data-dg="' + esc(g.id) + '" aria-label="Borrar">×</button></div></div>',
        )
        .join('')
    : '<span class="mut">Aún no hay facturas de gasolina. Guarda la primera arriba con su foto.</span>';
  renderPack();
}

// ---------- todos los tickets en un PDF ----------

/** Fechas elegidas en la tarjeta "Tickets para el gestor". */
function packRange() {
  const kind = $('#gper').value;
  if (kind === 'fechas') {
    const a = $('#gdes').value || '0000-01-01';
    const b = $('#ghas').value || '9999-12-31';
    return { kind, from: a <= b ? a : b, to: a <= b ? b : a };
  }
  return { kind, ...periodRange(kind, today()) };
}

function renderPack() {
  $('#gpack').hidden = !S.gas.length;
  if (!S.gas.length) return;
  const { from, to } = packRange();
  const p = fuelBetween(S.gas, from, to);
  $('#gsum').innerHTML = p.list.length
    ? '<b>' + p.list.length + (p.list.length === 1 ? ' factura' : ' facturas') + ' · ' + eur(p.total) + '</b>' +
      (p.liters ? ' · ' + String(p.liters).replace('.', ',') + ' L' : '') +
      '<br>' + (p.withPhoto === p.list.length ? 'Todas con foto del ticket.' : p.withPhoto + ' con foto; las demás salen solo en la lista.')
    : 'No hay facturas de gasolina en ese periodo.';
  $('#gpdf').disabled = !p.list.length;
}

async function makePack() {
  const button = $('#gpdf');
  const text0 = button.textContent;
  const { kind, from, to } = packRange();
  button.disabled = true;
  button.textContent = 'Preparando…';
  try {
    const res = await fuelPdf(from, to, (done, total) => {
      if (total) button.textContent = 'Preparando tickets ' + done + ' de ' + total + '…';
    });
    if (!res) return toast('No hay facturas de gasolina en ese periodo.');
    const file = new File([res.blob], packName(kind, today(), from, to), { type: 'application/pdf' });
    const message = 'Hola, te envío las facturas de gasolina' + (from === '0000-01-01' ? '' : ' del ' + fd(from) + ' al ' + fd(to)) +
      (S.cfg.nom ? ' de ' + S.cfg.nom : '') + ' (' + res.count + ' tickets en un PDF). Un saludo.';
    const shared = await shareFiles([file], 'Facturas de gasolina', message);
    if (shared === 'unavailable') {
      downloadBlob(file, file.name);
      if (S.cfg.gestor) {
        location.href = 'mailto:' + encodeURIComponent(S.cfg.gestor) + '?subject=' + encodeURIComponent('Facturas de gasolina') +
          '&body=' + encodeURIComponent(message + '\n\n(Adjunta el archivo ' + file.name + ' que se acaba de descargar.)');
      }
      toast('PDF descargado: ' + file.name);
    }
    if (res.missing) toast(res.missing + (res.missing === 1 ? ' ticket no tenía' : ' tickets no tenían') + ' la foto en este móvil; van solo en la lista.');
  } catch {
    toast('No se pudo crear el PDF. Revisa la conexión e inténtalo otra vez.');
  } finally {
    button.textContent = text0;
    renderPack();
  }
}

async function saveFuel(e) {
  e.preventDefault();
  const g = {
    id: uid(), mid: uid(), f: $('#gf').value, i: +$('#gi').value, l: +$('#gl').value || 0,
    p: $('#gp').value, s: $('#gs').value.trim(),
  };
  const file = $('#gh').files[0];
  if (file) {
    try {
      if (!(await storeReceipt(g.id, file))) throw new Error('sin espacio');
      g.ph = 1;
    } catch {
      toast('No se pudo guardar el archivo (falta espacio o el formato no es válido). La factura se guarda sin archivo.');
    }
  }
  // La gasolina también cuenta como gasto en la caja.
  S.mov.push({ id: g.mid, f: g.f, t: 'out', p: g.p, i: g.i, c: 'Gasolina' + (g.s ? ': ' + g.s : '') });
  S.gas.push(g);
  save();
  e.target.reset();
  $('#ocr').textContent = '';
  $('#gf').value = today();
  rerenderAll();
}

function deleteFuel(id) {
  const g = S.gas.find((x) => x.id === id);
  if (!g) return;
  S.gas = S.gas.filter((x) => x.id !== id);
  S.mov = S.mov.filter((m) => m.id !== g.mid);
  removePhotoLocal(g.id);
  if (g.ph) deletePhoto(g.id);
  save();
  rerenderAll();
}

async function showReceipt(id) {
  const src = (await getPhotoLocal(id)) || (await downloadPhoto(id));
  $('#phi').src = src || '';
  $('#ph').classList.add('on');
}

export function initGasolina(rerender) {
  rerenderAll = rerender;
  $('#gf').value = today();
  $('#fg').onsubmit = saveFuel;
  $('#gh').onchange = () => {
    const file = $('#gh').files[0];
    if (file) readReceipt(file);
    else $('#ocr').textContent = '';
  };
  $('#phx').onclick = () => $('#ph').classList.remove('on');
  $('#gper').innerHTML = [...PERIODS, ['fechas', 'Elegir fechas…']].map(([k, t]) => '<option value="' + k + '">' + t + '</option>').join('');
  $('#gper').value = 'tri';
  $('#gper').onchange = () => {
    $('#gcust').hidden = $('#gper').value !== 'fechas';
    renderPack();
  };
  $('#gdes').onchange = renderPack;
  $('#ghas').onchange = renderPack;
  $('#gpdf').onclick = makePack;
  onClick('[data-dg]', (el) => deleteFuel(el.dataset.dg));
  onClick('[data-ph]', (el) => showReceipt(el.dataset.ph));
}
