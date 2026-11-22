// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Mensajes rápidos al cliente (Transfer): plantillas con los datos del servicio,
// en el idioma del cliente, para enviar por WhatsApp. Funciones puras.
// Las frases con un dato que falta no se envían (fillTemplate).
import { fillTemplate } from './welcome.js';

export const MSG_LANGS = [['es', '🇪🇸 Español'], ['en', '🇬🇧 English'], ['de', '🇩🇪 Deutsch'], ['fr', '🇫🇷 Français']];

/** Plantillas de serie. {min}: minutos; {llegada}: hora real/estimada del vuelo; {coche}/{matricula}: tu coche. */
export const QUICK = [
  {
    id: 'llegadas', title: '🛬 Ya estoy en llegadas',
    es: 'Hola {nombre}, soy {chofer}, tu conductor. Ya estoy en llegadas esperándote con un cartel con tu nombre. Te espero en {punto}.',
    en: 'Hi {nombre}, this is {chofer}, your driver. I\'m already at arrivals waiting for you with a sign with your name. I\'m waiting at {punto}.',
    de: 'Hallo {nombre}, hier ist {chofer}, Ihr Fahrer. Ich warte bereits in der Ankunftshalle mit einem Schild mit Ihrem Namen. Ich warte bei {punto}.',
    fr: 'Bonjour {nombre}, ici {chofer}, votre chauffeur. Je suis déjà aux arrivées avec une pancarte à votre nom. Je vous attends à {punto}.',
  },
  {
    id: 'llego', title: '⏱️ Llego en unos minutos',
    es: 'Hola {nombre}, soy {chofer}. Llego en {min} minutos.',
    en: 'Hi {nombre}, this is {chofer}. I\'ll be there in {min} minutes.',
    de: 'Hallo {nombre}, hier ist {chofer}. Ich bin in {min} Minuten da.',
    fr: 'Bonjour {nombre}, ici {chofer}. J\'arrive dans {min} minutes.',
  },
  {
    id: 'retraso', title: '✈️ Tu vuelo llega tarde',
    es: 'Hola {nombre}, veo que tu vuelo {vuelo} llega a las {llegada}. No te preocupes, sigo tu vuelo y te espero.',
    en: 'Hi {nombre}, I see your flight {vuelo} is landing at {llegada}. Don\'t worry, I\'m tracking your flight and I\'ll be waiting for you.',
    de: 'Hallo {nombre}, Ihr Flug {vuelo} landet um {llegada}. Keine Sorge, ich verfolge Ihren Flug und warte auf Sie.',
    fr: 'Bonjour {nombre}, je vois que votre vol {vuelo} atterrit à {llegada}. Pas d\'inquiétude, je suis votre vol et je vous attends.',
  },
  {
    id: 'aterrizado', title: '🧳 Ya has aterrizado',
    es: '¡Bienvenido/a, {nombre}! Tu vuelo ya ha aterrizado. Cuando recojas tu equipaje, te espero en {punto}.',
    en: 'Welcome, {nombre}! Your flight has landed. Once you have your luggage, I\'ll be waiting for you at {punto}.',
    de: 'Willkommen, {nombre}! Ihr Flug ist gelandet. Wenn Sie Ihr Gepäck haben, warte ich bei {punto} auf Sie.',
    fr: 'Bienvenue, {nombre} ! Votre vol a atterri. Dès que vous aurez vos bagages, je vous attends à {punto}.',
  },
  {
    id: 'donde', title: '📍 ¿Dónde estás?',
    es: 'Hola {nombre}, soy {chofer}, tu conductor. Te estoy esperando en {punto}. ¿Dónde estás?',
    en: 'Hi {nombre}, this is {chofer}, your driver. I\'m waiting for you at {punto}. Where are you?',
    de: 'Hallo {nombre}, hier ist {chofer}, Ihr Fahrer. Ich warte bei {punto} auf Sie. Wo sind Sie?',
    fr: 'Bonjour {nombre}, ici {chofer}, votre chauffeur. Je vous attends à {punto}. Où êtes-vous ?',
  },
  {
    id: 'coche', title: '🚘 Mi coche',
    es: 'Te espero en un {coche}, matrícula {matricula}.',
    en: 'I\'ll be waiting in a {coche}, number plate {matricula}.',
    de: 'Ich warte in einem {coche}, Kennzeichen {matricula}.',
    fr: 'Je vous attends dans une {coche}, immatriculée {matricula}.',
  },
  {
    id: 'confirmar', title: '🗓️ Confirmar la recogida',
    es: 'Hola {nombre}, soy {chofer}. Te confirmo la recogida el {fecha} a las {recogida} en {origen}, con destino {destino}. ¡Hasta pronto!',
    en: 'Hi {nombre}, this is {chofer}. I confirm your pick-up on {fecha} at {recogida} at {origen}, going to {destino}. See you soon!',
    de: 'Hallo {nombre}, hier ist {chofer}. Ich bestätige Ihre Abholung am {fecha} um {recogida} in {origen}, Ziel {destino}. Bis bald!',
    fr: 'Bonjour {nombre}, ici {chofer}. Je vous confirme la prise en charge le {fecha} à {recogida} à {origen}, à destination de {destino}. À bientôt !',
  },
  {
    id: 'gracias', title: '🙏 Gracias y vuelta',
    es: 'Gracias por viajar conmigo, {nombre}. ¡Que disfrutes de tu estancia! Si necesitas traslado de vuelta, escríbeme a este número.',
    en: 'Thank you for travelling with me, {nombre}. Enjoy your stay! If you need a transfer back, just message me on this number.',
    de: 'Vielen Dank, dass Sie mit mir gefahren sind, {nombre}. Genießen Sie Ihren Aufenthalt! Wenn Sie eine Rückfahrt brauchen, schreiben Sie mir an diese Nummer.',
    fr: 'Merci d\'avoir voyagé avec moi, {nombre}. Profitez bien de votre séjour ! Pour le trajet retour, écrivez-moi à ce numéro.',
  },
];

/** Datos de este mensaje que no están en el servicio. */
export function messageExtras(cfg, { min, arrival } = {}) {
  return {
    min: min ? String(min) : '',
    llegada: arrival || '',
    coche: (cfg.coche || '').trim(),
    matricula: (cfg.mat || '').trim().toUpperCase(),
    origen: '',
  };
}

/** Las plantillas: las de serie y las tuyas ({id:'m…', title, text, lang}). */
export function allTemplates(cfg) {
  return [...QUICK, ...((cfg && cfg.msgs) || []).map((m) => ({ id: m.id, title: '⭐ ' + m.title, mine: true, [m.lang || 'es']: m.text }))];
}

/** El texto de una plantilla en un idioma (si una tuya está en otro idioma, se usa tal cual). */
export function templateText(t, lang) {
  return t[lang] || t.es || t.en || Object.values(t).find((v) => typeof v === 'string' && v.includes(' ')) || '';
}

/** Mensaje listo para enviar. */
export function buildMessage(id, service, cfg, { lang = 'es', min, arrival } = {}) {
  const t = allTemplates(cfg).find((x) => x.id === id);
  if (!t) return '';
  const extra = { ...messageExtras(cfg, { min, arrival }), origen: service.o || '' };
  return fillTemplate(templateText(t, lang), service, cfg, extra);
}

/** ¿Usa esta plantilla los minutos o tu coche? (para enseñar esos campos). */
export const usesField = (id, field, cfg) => {
  const t = allTemplates(cfg).find((x) => x.id === id);
  return !!t && Object.values(t).some((v) => typeof v === 'string' && v.includes('{' + field + '}'));
};
