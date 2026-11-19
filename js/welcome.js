// Mensaje de bienvenida por WhatsApp: mensajes preparados y plantillas propias. Funciones puras.
import { fd } from './utils.js';

export const DEFAULT_WELCOME_EN =
  'Hello {nombre}! Welcome. My name is {chofer} and I will be your driver. We will meet at {punto}. Your flight {vuelo} departs at {hora}. See you soon!';
export const DEFAULT_WELCOME_ES =
  '¡Hola {nombre}! Bienvenido/a. Me llamo {chofer} y seré tu chofer. Nos vemos en {punto}.';

/** Mensajes preparados. Las frases con un dato que falta no se envían. */
export const PRESETS = [
  {
    id: 'cercano', title: '😊 Cercano',
    en: 'Hi {nombre}! I\'m {chofer}, your driver. I\'ll be happy to take you safely to your destination today. Once you land, we\'ll meet at {punto}. See you soon!',
    es: '¡Hola {nombre}! Soy {chofer}, tu conductor. Estaré encantado de llevarte hoy a tu destino de forma segura. Nos encontraremos en {punto} una vez aterrices, ¿vale? ¡Hasta ahora!',
  },
  {
    id: 'formal', title: '👔 Formal',
    en: '{saludo_en}, {nombre}. My name is {chofer} and I will be your driver today. It will be a pleasure to take you safely to {destino}. I will be waiting for you at {punto} once you have landed. Have a pleasant flight.',
    es: '{saludo_es}, {nombre}. Mi nombre es {chofer} y seré su conductor hoy. Será un placer llevarle con total seguridad a {destino}. Le estaré esperando en {punto} en cuanto aterrice. Que tenga un buen vuelo.',
  },
  {
    id: 'cartel', title: '🪧 Con cartel',
    en: 'Hello {nombre}, this is {chofer}, your driver. I\'m following your flight {vuelo} live, so don\'t worry about any delay. I\'ll be waiting at {punto} with a sign with your name. Have a good flight!',
    es: 'Hola {nombre}, soy {chofer}, tu conductor. Estoy siguiendo tu vuelo {vuelo} en directo, así que no te preocupes si hay retraso. Te esperaré en {punto} con un cartel con tu nombre. ¡Buen vuelo!',
  },
  {
    id: 'corto', title: '⚡ Corto',
    en: 'Hi {nombre}, I\'m {chofer}, your driver. I\'ll be at {punto} when you land. 🚖',
    es: 'Hola {nombre}, soy {chofer}, tu conductor. Te espero en {punto} cuando aterrices. 🚖',
  },
  {
    id: 'vip', title: '⭐ VIP',
    en: 'Dear {nombre}, welcome to {ciudad}. My name is {chofer} and I will be your private driver. Upon arrival, I will be waiting for you at {punto} with a name sign. Should you need anything, please do not hesitate to contact me on this number. Have a pleasant journey.',
    es: 'Estimado/a {nombre}, bienvenido/a a {ciudad}. Mi nombre es {chofer} y seré su conductor privado. A su llegada, le estaré esperando en {punto} con un cartel con su nombre. Si necesita cualquier cosa, no dude en escribirme a este número. Que tenga un buen viaje.',
  },
];

const TITLES = /^(mr|mrs|ms|miss|mx|dr|sr|sra|srta|don|dña|doña|herr|frau|mme|mlle|m|mister|madam|sir)$/;
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** Solo el nombre de pila: "MRS. SIEN VANHAUWAERT &_" → "Sien". */
export function firstName(full) {
  const words = String(full || '')
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const w = words.find((x) => !TITLES.test(x.toLowerCase().replace(/\.$/, '')));
  return w ? w.split('-').map(cap).join('-') : '';
}

/** Nombre del conductor: el que puso para la bienvenida o, si no, el nombre de pila de su cuenta. */
export const driverName = (cfg) => (cfg.chof || '').trim() || firstName(cfg.nom);

/** "Good morning" / "Buenos días"… según la hora de recogida. */
export function greeting(hour, lang) {
  const h = parseInt(hour, 10);
  const part = Number.isNaN(h) ? 1 : h < 12 ? 0 : h < 20 ? 1 : 2;
  return lang === 'en' ? ['Good morning', 'Good afternoon', 'Good evening'][part] : ['Buenos días', 'Buenas tardes', 'Buenas noches'][part];
}

/**
 * Rellena una plantilla con los datos del servicio. Las frases que usan un
 * dato vacío se eliminan enteras, para no enviar huecos al cliente.
 * `extra` permite cambiar datos solo para este mensaje (p. ej. el punto).
 */
export function fillTemplate(template, service, cfg, extra = {}) {
  const values = {
    nombre: firstName(service.pa),
    pasajero: service.pa || '',
    chofer: driverName(cfg),
    punto: (cfg.punto || '').trim(),
    vuelo: service.vu || '',
    hora: service.sv || '',
    destino: service.d || '',
    fecha: service.f ? fd(service.f) : '',
    recogida: service.h || '',
    ciudad: (cfg.loc || '').trim(),
    saludo_en: greeting(service.h, 'en'),
    saludo_es: greeting(service.h, 'es'),
    ...extra,
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

/** Plantillas de un mensaje: uno preparado (`preset`) o el propio ("mio"). */
export function templatesOf(preset, cfg) {
  if (preset === 'mio') return { en: cfg.wen === undefined ? DEFAULT_WELCOME_EN : cfg.wen, es: cfg.wes === undefined ? DEFAULT_WELCOME_ES : cfg.wes };
  return PRESETS.find((p) => p.id === preset) || PRESETS[0];
}

/** Mensaje listo para enviar. lang: 'en', 'es' o 'ambos'. */
export function buildWelcome(service, cfg, { preset, lang = 'ambos', punto } = {}) {
  const t = templatesOf(preset || cfg.wp || 'cercano', cfg);
  const extra = punto !== undefined ? { punto: punto.trim() } : {};
  const en = lang === 'es' ? '' : fillTemplate(t.en, service, cfg, extra);
  const es = lang === 'en' ? '' : fillTemplate(t.es, service, cfg, extra);
  return [en, es].filter(Boolean).join('\n\n');
}

/** Mensaje completo con lo elegido por defecto (o la plantilla propia de siempre). */
export function welcomeMessage(service, cfg) {
  return buildWelcome(service, cfg, { preset: cfg.wp || 'mio', lang: cfg.wl || 'ambos' });
}

/** Hora a la que conviene mandar la bienvenida: una hora antes del vuelo. */
export function welcomeSendTime(flightTime) {
  if (!flightTime) return '';
  const [h, m] = flightTime.split(':');
  const d = new Date(2000, 0, 1, +h - 1, +m);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
