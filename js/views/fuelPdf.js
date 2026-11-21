// PDF con todas las facturas de gasolina de un periodo: resumen + un ticket por página.
import { tr } from '../i18n.js';
import { downloadPhoto } from '../cloud.js';
import { loadScript } from '../dom.js';
import { fuelBetween } from '../fuelPack.js';
import { S, getPhotoLocal } from '../store.js';
import { cap, eur, fd } from '../utils.js';

const JSPDF = 'vendor/jspdf-4.2.1.umd.min.js';

const imageSize = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

const liters = (l) => (l ? String(l).replace('.', ',') + ' L' : '—');

/**
 * Crea el PDF de las facturas de gasolina entre `from` y `to`.
 * `progress(hechas, total)` avisa mientras se cargan las fotos.
 * Devuelve {blob, count, missing} o null si no hay facturas en el periodo.
 */
export async function fuelPdf(from, to, progress = () => {}) {
  const pack = fuelBetween(S.gas, from, to);
  if (!pack.list.length) return null;
  await loadScript(JSPDF);
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 20;
  const text = (t, x, opts = {}) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size || 10);
    pdf.setTextColor(opts.color || 20);
    pdf.text(tr(t), x, y, opts.align ? { align: opts.align } : undefined);
  };

  // Portada con la lista
  const period = from === '0000-01-01' ? 'Todas las facturas guardadas' : 'Del ' + fd(from) + ' al ' + fd(to);
  text('Facturas de gasolina', 18, { bold: true, size: 18 });
  y += 8;
  text(period, 18, { size: 11, color: 80 });
  y += 6;
  const who = [S.cfg.nom, S.cfg.nif && 'NIF ' + S.cfg.nif, S.cfg.lic].filter(Boolean).join(' · ');
  if (who) { text(who, 18, { size: 10, color: 80 }); y += 6; }
  y += 6;
  const cols = [18, 28, 52, 116, 140, 192];
  const header = () => {
    pdf.setFillColor(29, 95, 224);
    pdf.rect(15, y - 5, W - 30, 8, 'F');
    ['Nº', 'Fecha', 'Gasolinera', 'Litros', 'Pago'].forEach((h, i) => text(h, cols[i], { bold: true, size: 9, color: 255 }));
    text('Importe', cols[5], { bold: true, size: 9, color: 255, align: 'right' });
    y += 9;
  };
  header();
  pack.list.forEach((g, i) => {
    if (y > 275) { pdf.addPage(); y = 20; header(); }
    if (i % 2) { pdf.setFillColor(242, 245, 250); pdf.rect(15, y - 5, W - 30, 7, 'F'); }
    text(String(i + 1), cols[0], { size: 9 });
    text(fd(g.f), cols[1], { size: 9 });
    text((g.s || 'Gasolinera').slice(0, 34) + (g.ph ? '' : '  (sin foto)'), cols[2], { size: 9 });
    text(liters(g.l), cols[3], { size: 9 });
    text(cap(g.p || ''), cols[4], { size: 9 });
    text(eur(g.i), cols[5], { size: 9, align: 'right' });
    y += 7;
  });
  y += 2;
  pdf.setDrawColor(29, 95, 224);
  pdf.line(15, y - 4, W - 15, y - 4);
  text('Total · ' + pack.list.length + ' facturas · ' + liters(pack.liters), cols[0], { bold: true, size: 10 });
  text(eur(pack.total), cols[5], { bold: true, size: 11, align: 'right' });
  y += 10;
  text(pack.withPhoto ? 'Cada ticket va en las páginas siguientes, en el mismo orden (Nº).' : 'Ninguna factura de este periodo tiene foto guardada.', 18, { size: 9, color: 100 });

  // Un ticket por página
  const withPhoto = pack.list.filter((g) => g.ph);
  let done = 0;
  let missing = 0;
  for (const g of pack.list) {
    if (!g.ph) continue;
    progress(done, withPhoto.length);
    const n = pack.list.indexOf(g) + 1;
    const src = (await getPhotoLocal(g.id)) || (await downloadPhoto(g.id));
    done++;
    pdf.addPage();
    y = 16;
    text('Nº ' + n + ' · ' + fd(g.f) + ' · ' + (g.s || 'Gasolinera') + ' · ' + liters(g.l) + ' · ' + cap(g.p || ''), 15, { bold: true, size: 11 });
    text(eur(g.i), W - 15, { bold: true, size: 11, align: 'right' });
    const size = src ? await imageSize(src) : null;
    if (!size) {
      missing++;
      y = 40;
      text('La foto de este ticket no está en este móvil ni en la cuenta.', 15, { size: 10, color: 120 });
      continue;
    }
    const maxW = W - 30;
    const maxH = 297 - 24 - 14;
    const k = Math.min(maxW / size.w, maxH / size.h);
    const w = size.w * k;
    const h = size.h * k;
    pdf.addImage(src, 'JPEG', (W - w) / 2, 24, w, h, undefined, 'FAST');
  }
  progress(done, withPhoto.length);
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    y = 290;
    text('Rutivo · página ' + i + ' de ' + pages, W / 2, { size: 8, color: 140, align: 'center' });
  }
  return { blob: pdf.output('blob'), count: pack.list.length, missing };
}
