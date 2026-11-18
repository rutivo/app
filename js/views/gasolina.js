// Pantalla "Gasolina": facturas de combustible con foto o PDF.
import { canStorePhotoInCloud, deletePhoto, downloadPhoto, uploadPhoto } from '../cloud.js';
import { $, onClick, toast } from '../dom.js';
import { S, getPhotoLocal, removePhotoLocal, save, savePhotoLocal } from '../store.js';
import { cap, esc, eur, fd, sum, today, uid } from '../utils.js';

const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const v0 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 1000 / v0.width });
  const c = document.createElement('canvas');
  c.width = viewport.width;
  c.height = viewport.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
  return c.toDataURL('image/jpeg', 0.65);
}

/** Guarda la foto en el móvil y/o en la cuenta. Devuelve true si se guardó en algún sitio. */
async function storeReceipt(id, file) {
  const dataUrl = file.type === 'application/pdf' ? await pdfToImage(file) : await shrinkImage(file);
  const local = savePhotoLocal(id, dataUrl);
  const cloud = canStorePhotoInCloud(dataUrl);
  if (!local && !cloud) return false;
  if (cloud) uploadPhoto(id, dataUrl);
  return true;
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
  const src = getPhotoLocal(id) || (await downloadPhoto(id));
  $('#phi').src = src || '';
  $('#ph').classList.add('on');
}

export function initGasolina(rerender) {
  rerenderAll = rerender;
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  $('#gf').value = today();
  $('#fg').onsubmit = saveFuel;
  $('#phx').onclick = () => $('#ph').classList.remove('on');
  onClick('[data-dg]', (el) => deleteFuel(el.dataset.dg));
  onClick('[data-ph]', (el) => showReceipt(el.dataset.ph));
}
