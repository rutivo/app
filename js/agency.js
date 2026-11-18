// Lectura del texto de un servicio enviado por la agencia. Función pura.
import { titleCase } from './utils.js';

/**
 * Extrae los datos de un servicio con líneas "Campo: valor".
 * Devuelve null si el texto no contiene una fecha.
 */
export function parseAgencyService(text) {
  const field = (key) => {
    const m = text.match(new RegExp('^\\s*' + key + '\\s*:\\s*(.+)$', 'im'));
    return m ? m[1].trim() : '';
  };
  if (!field('Fecha')) return null;

  const [day = '', month = '', year = ''] = field('Fecha').split('/');
  const destination = field('Destino').split(' - ');

  let amount = parseFloat(field('Importe a cobrar al cliente').replace(',', '.')) || 0;
  if (!amount) {
    const m = text.match(/no cobrar\s*([\d.,]+)/i);
    if (m) amount = parseFloat(m[1].replace(',', '.')) || 0;
  }

  return {
    date: year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0'),
    time: field('Hora'),
    origin: titleCase(field('Origen').replace(/\s*-\s*[a-z]{3}$/i, '')),
    destination: titleCase(destination[0] ?? ''),
    amount,
    notes: 'Cód. ' + field('Código Servicio') + (destination[1] ? ' · ' + destination.slice(1).join(' - ') : ''),
    passenger: titleCase(field('Nombre').replace(/[*/]+/g, '').trim()),
    flight: field('Vuelo').toUpperCase(),
    phone: (text.match(/\+\d[\d\s]{8,}/) || [''])[0].trim(),
  };
}
