// Envío del resumen trimestral al gestor: PDF + CSV (Excel).
import { $, downloadBlob, loadScript, shareFiles, toast } from '../dom.js';
import { quarterCsv, quarterData } from '../report.js';
import { S } from '../store.js';
import { eur, fd } from '../utils.js';
import { fuelPdf } from './fuelPdf.js';

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const label = (q) => 'T' + q.slice(-1) + ' ' + q.slice(0, 4);

/** PDF de una página con el resumen del trimestre y las facturas. */
async function quarterPdf(q) {
  await loadScript(JSPDF);
  const d = quarterData(S, q);
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  let y = 20;
  const line = (text, opts = {}) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size || 11);
    pdf.text(text, opts.x || 18, y);
    if (opts.right) pdf.text(opts.right, 192, y, { align: 'right' });
    y += opts.gap || 7;
  };
  line('Resumen trimestral ' + label(q), { bold: true, size: 18, gap: 9 });
  line([S.cfg.nom, S.cfg.nif && 'NIF ' + S.cfg.nif, S.cfg.lic].filter(Boolean).join(' · '), { size: 10, gap: 10 });
  const rows = [
    ['Ingresos (IVA incluido)', eur(d.income)], ['  · Con tarjeta', eur(d.card)], ['  · En efectivo', eur(d.cash)],
    ['Base imponible', eur(d.base)], ['IVA (' + d.iva + '%)', eur(d.vat)], ['Gastos', eur(d.expenses)],
    ['Gasolina (' + String(d.fuelLiters).replace('.', ',') + ' L)', eur(d.fuel)], ['Facturas emitidas', eur(d.invoiced)],
  ];
  rows.forEach(([a, b], i) => line(a, { right: b, bold: i === 0 || i === 3 || i === 4 }));
  y += 4;
  line('Facturas del trimestre (' + d.invoices.length + ')', { bold: true, size: 13, gap: 8 });
  for (const f of d.invoices) {
    if (y > 280) { pdf.addPage(); y = 20; }
    line(f.num + '  ·  ' + fd(f.fecha) + '  ·  ' + f.cl.nom, { size: 10, right: eur(f.items.reduce((a, x) => a + x.i, 0)), gap: 6 });
  }
  y += 4;
  if (y > 270) { pdf.addPage(); y = 20; }
  line('El detalle de todos los movimientos va en el archivo CSV (se abre con Excel).', { size: 9, gap: 5 });
  line('Generado con Rutivo el ' + new Date().toLocaleDateString('es-ES') + '.', { size: 9 });
  return pdf.output('blob');
}

/** Prepara los archivos del trimestre `q` y abre el menú de compartir. */
export async function sendQuarterToAccountant(q) {
  const button = $('#tqsend');
  const text0 = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparando…';
  try {
    const name = 'Rutivo-' + q;
    const pdf = new File([await quarterPdf(q)], name + '.pdf', { type: 'application/pdf' });
    const csv = new File([quarterCsv(S, q)], name + '.csv', { type: 'text/csv' });
    const files = [pdf, csv];
    // Los tickets de gasolina del trimestre, juntos en otro PDF.
    const y = q.slice(0, 4);
    const m = (+q.slice(-1) - 1) * 3 + 1;
    const pad = (n) => String(n).padStart(2, '0');
    const fuel = await fuelPdf(y + '-' + pad(m) + '-01', y + '-' + pad(m + 2) + '-31');
    if (fuel) files.push(new File([fuel.blob], 'Gasolina-' + q + '.pdf', { type: 'application/pdf' }));
    const message = 'Hola, te envío el resumen del ' + label(q) + (S.cfg.nom ? ' de ' + S.cfg.nom : '') +
      (fuel ? ' (PDF, Excel y las facturas de gasolina).' : ' (PDF y Excel).') + ' Un saludo.';
    const result = await shareFiles(files, 'Resumen ' + label(q), message);
    if (result === 'unavailable') {
      files.forEach((f) => downloadBlob(f, f.name));
      if (S.cfg.gestor) {
        location.href = 'mailto:' + encodeURIComponent(S.cfg.gestor) + '?subject=' + encodeURIComponent('Resumen ' + label(q)) +
          '&body=' + encodeURIComponent(message + '\n\n(Adjunta los archivos ' + files.map((f) => f.name).join(', ') + ' que se acaban de descargar.)');
      }
      toast('Archivos descargados: ' + files.map((f) => f.name).join(', '));
    }
  } catch {
    toast('No se pudo preparar el resumen. Revisa la conexión e inténtalo otra vez.');
  }
  button.disabled = false;
  button.textContent = text0;
}
