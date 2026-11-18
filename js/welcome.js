// Mensaje de bienvenida por WhatsApp. Funciones puras.
import { fd } from './utils.js';

export const DEFAULT_WELCOME_EN =
  'Hello {nombre}! Welcome. My name is {chofer} and I will be your driver. We will meet at {punto}. Your flight {vuelo} departs at {hora}. See you soon!';
export const DEFAULT_WELCOME_ES =
  '¡Hola {nombre}! Bienvenido/a. Me llamo {chofer} y seré tu chofer. Nos vemos en {punto}.';

/**
 * Rellena una plantilla con los datos del servicio. Las frases que usan un
 * dato vacío se eliminan enteras, para no enviar huecos al cliente.
 */
export function fillTemplate(template, service, cfg) {
  const values = {
    nombre: (service.pa || '').split(' ')[0],
    pasajero: service.pa || '',
    chofer: (cfg.chof || '').trim(),
    punto: (cfg.punto || '').trim(),
    vuelo: service.vu || '',
    hora: service.sv || '',
    destino: service.d || '',
    fecha: service.f ? fd(service.f) : '',
    recogida: service.h || '',
  };
  const usable = (sentence) =>
    [...sentence.matchAll(/\{(\w+)\}/g)].every(([, k]) => !(k in values) || values[k]);
  const fill = (sentence) => sentence.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));

  return String(template || '')
    .split('\n')
    .map((line) => (line.match(/[^.!?]*[.!?]+|[^.!?]+$/g) || [line]).filter(usable).map(fill).join('').trim())
    .join('\n')
    .trim();
}

/** Mensaje completo (inglés + español) para un servicio. */
export function welcomeMessage(service, cfg) {
  const en = fillTemplate(cfg.wen === undefined ? DEFAULT_WELCOME_EN : cfg.wen, service, cfg);
  const es = fillTemplate(cfg.wes === undefined ? DEFAULT_WELCOME_ES : cfg.wes, service, cfg);
  return [en, es].filter(Boolean).join('\n\n');
}

/** Hora a la que conviene mandar la bienvenida: una hora antes del vuelo. */
export function welcomeSendTime(flightTime) {
  if (!flightTime) return '';
  const [h, m] = flightTime.split(':');
  const d = new Date(2000, 0, 1, +h - 1, +m);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
