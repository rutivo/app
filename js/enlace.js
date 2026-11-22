// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// «Enlace para tu cliente»: una página (cliente.html) que el cliente abre desde
// WhatsApp, sin instalar nada y en su idioma, con tu nombre, tu coche, dónde
// esperas, su vuelo y botones para escribirte o llamarte. Funciones puras.
//
// Los datos van DENTRO del enlace, después de «#»: esa parte no se envía a
// ningún servidor (ni a GitHub), solo la lee el navegador del cliente.
// No se guarda nada en Firebase ni en ningún sitio.
import { driverName, firstName } from './welcome.js';

export const LINK_LANGS = ['es', 'en', 'de', 'fr'];
const MAX = 140; // ningún dato del enlace puede ser más largo que esto

/** Campos que puede llevar el enlace (clave corta → qué es). */
const FIELDS = {
  l: 'idioma', n: 'nombre del cliente', d: 'conductor', t: 'teléfono del conductor', c: 'coche', m: 'matrícula',
  p: 'punto de encuentro', f: 'vuelo', dt: 'fecha', h: 'hora', o: 'origen', de: 'destino',
};

const clean = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX);

/** Datos del servicio `s` que verá el cliente (solo los que no están vacíos). */
export function linkData(s, cfg, lang = 'en') {
  const raw = {
    l: LINK_LANGS.includes(lang) ? lang : 'en',
    n: firstName(s.pa),
    d: driverName(cfg),
    t: (cfg.tel || '').replace(/[^\d+]/g, ''),
    c: cfg.coche,
    m: (cfg.mat || '').toUpperCase(),
    p: cfg.punto,
    f: (s.vu || '').toUpperCase().replace(/\s/g, ''),
    dt: s.f,
    h: s.h,
    o: s.o,
    de: s.d,
  };
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const c = clean(v);
    if (c) out[k] = c;
  }
  return out;
}

const b64url = (bytes) => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Datos → texto para poner después de «#». */
export function encodeLink(data) {
  return b64url(new TextEncoder().encode(JSON.stringify({ v: 1, ...data })));
}

/**
 * Texto de después de «#» → datos, o null si el enlace está roto o es raro.
 * Solo se aceptan los campos conocidos, como texto y con un tamaño máximo:
 * un enlace manipulado no puede meter nada más en la página.
 */
export function decodeLink(hash) {
  try {
    const [main, ph] = String(hash || '').replace(/^#/, '').split('.');
    const s = main.replace(/-/g, '+').replace(/_/g, '/');
    if (!s || s.length > 4000) return null;
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    return cleanLink(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))), ph);
  } catch {
    return null;
  }
}

/**
 * Comprueba los datos de un enlace (vengan dentro del enlace o de la nube):
 * solo los campos conocidos, como texto, con tamaño y formato comprobados.
 * `ph`: la foto en base64 (con - y _ o con + y /), o nada.
 */
export function cleanLink(obj, ph) {
  if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
  const out = {};
  for (const k of Object.keys(FIELDS)) {
    if (typeof obj[k] === 'string' || typeof obj[k] === 'number') {
      const c = clean(obj[k]);
      if (c) out[k] = c;
    }
  }
  if (!LINK_LANGS.includes(out.l)) out.l = 'en';
  if (out.dt && !/^\d{4}-\d{2}-\d{2}$/.test(out.dt)) delete out.dt;
  if (out.h && !/^\d{2}:\d{2}$/.test(out.h)) delete out.h;
  if (out.f && !/^[A-Z0-9]{3,8}$/.test(out.f)) delete out.f;
  if (out.t && !/^\+?\d{6,15}$/.test(out.t)) delete out.t;
  // Foto: solo una JPEG (empieza por /9j/), solo letras del base64 y con tamaño máximo
  if (typeof ph === 'string' && ph.length <= PHOTO_MAX + 4 && /^[A-Za-z0-9_+/-]+={0,2}$/.test(ph)) {
    const b = ph.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (b.startsWith('/9j/')) out.ph = 'data:image/jpeg;base64,' + b + '='.repeat((4 - (b.length % 4)) % 4);
  }
  return out;
}

// ---------- Enlace corto (los datos se guardan en la nube, en enlaces/{código}) ----------

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Código secreto del enlace: 20 letras y números al azar (≈ 119 bits: imposible de adivinar). */
export function newLinkId() {
  const r = crypto.getRandomValues(new Uint8Array(40));
  let id = '';
  for (const b of r) if (b < 248 && id.length < 20) id += B62[b % 62]; // sin sesgo
  return id.length === 20 ? id : newLinkId();
}
export const isLinkId = (s) => /^[A-Za-z0-9]{20}$/.test(String(s || '').replace(/^#/, ''));

/** Enlace corto: …/cliente.html#código */
export const shortUrl = (base, id) => new URL('cliente.html', base).href + '#' + id;

/** Lo que se guarda en la nube para el enlace (sin el dueño ni la caducidad, que pone quien lo sube). */
export function linkRecord(data, photo) {
  const rec = { d: JSON.stringify({ v: 1, ...data }) };
  const ph = photoPart(photo);
  if (ph) rec.ph = ph;
  return rec;
}

/** Hasta cuándo se puede abrir: 2 días después del servicio (sin fecha, 30 días). Nunca más de 44 días. */
export function linkExpiry(data, now = Date.now()) {
  const t = spainTime(data.dt, data.h);
  const exp = t ? Math.max(now, t) + 2 * 864e5 : now + 30 * 864e5;
  return Math.min(exp, now + 44 * 864e5);
}

/** Documento leído con la API REST de Firestore → datos del enlace, o null (caducado, roto…). */
export function fromRest(doc, now = Date.now()) {
  const f = doc && doc.fields;
  if (!f || !f.d || typeof f.d.stringValue !== 'string') return null;
  const exp = f.exp && f.exp.timestampValue ? Date.parse(f.exp.timestampValue) : 0;
  if (!(exp > now)) return null;
  try {
    const out = cleanLink(JSON.parse(f.d.stringValue), f.ph && f.ph.stringValue);
    if (out && f.st && typeof f.st.stringValue === 'string') out.st = clean(f.st.stringValue).slice(0, 20);
    return out;
  } catch {
    return null;
  }
}

/** Tamaño máximo de la foto del punto de encuentro dentro del enlace (caracteres). */
export const PHOTO_MAX = 12000;

/** Foto (data:image/jpeg;base64,…) → trozo para el enlace, o '' si no vale. */
export function photoPart(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!m || !m[1].startsWith('/9j/')) return '';
  const part = m[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return part.length <= PHOTO_MAX ? part : '';
}

/**
 * Enlace completo. `base` = dirección de la app (p. ej. https://rutivo.github.io/app/).
 * La foto (si hay) va al final, tras un punto: #datos.foto
 */
export const clientUrl = (base, data, photo = '') => {
  const ph = photoPart(photo);
  return new URL('cliente.html', base).href + '#' + encodeLink(data) + (ph ? '.' + ph : '');
};

/** Milisegundos de una fecha y hora de España (sea cual sea la zona horaria del móvil que lo abre). */
export function spainTime(date, time) {
  if (!date) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Diferencia entre la hora de Madrid y UTC en ese momento (1 h en invierno, 2 h en verano)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).reduce((a, p) => ({ ...a, [p.type]: +p.value }), {});
  const asMadrid = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return guess - (asMadrid - guess);
}

/** "10:42" en hora de España. */
export const spainClock = (ms) => new Date(ms).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

/**
 * En qué punto está el servicio, para el cliente:
 * 'flying' (su vuelo va de camino), 'landed' (ha aterrizado), 'soon' (falta poco para la recogida),
 * 'later' (otro día / más adelante), 'past' (ya pasó), 'canceled'.
 * Nunca dice que el conductor «ya está»: eso solo lo sabe él (paso 2, con su botón).
 */
export function stageOf(data, flight, now = Date.now()) {
  const pickup = spainTime(data.dt, data.h);
  if (flight && flight.found !== false && /^Cancel|Diverted/.test(flight.status || '')) return 'canceled';
  const landed = flight && (flight.status === 'Arrived' || flight.status === 'Landed' || (flight.arr && flight.arr.runway));
  if (pickup && now > pickup + 4 * 36e5) return 'past';
  if (landed) return 'landed';
  if (flight && /EnRoute|Departed|Approaching|Delayed|Boarding|GateClosed/.test(flight.status || '')) return 'flying';
  if (pickup && pickup - now < 3 * 36e5) return 'soon';
  return 'later';
}

/** ¿Merece la pena preguntar por el vuelo? (de 8 h antes a 4 h después de la recogida). */
export const shouldAskFlight = (data, now = Date.now()) => {
  const t = spainTime(data.dt, data.h);
  return !!(data.f && t && now > t - 8 * 36e5 && now < t + 4 * 36e5);
};

/** Textos de la página del cliente. */
export const T = {
  en: {
    title: 'Your transfer', hi: 'Hi {n}!', hiNo: 'Hello!', with: 'Your driver is {d}.',
    later: 'Your transfer is booked', soon: 'Your transfer is today', flying: 'Your flight is on its way', landed: 'Welcome! Your flight has landed', past: 'This transfer has finished', canceled: 'Your flight shows as cancelled or diverted',
    laterS: 'Everything is ready. Your driver will be waiting for you.', soonS: 'Your driver is following your flight and will be there on time.', flyingS: 'Your driver is following your flight live. No need to worry about delays.', landedS: 'Once you have your luggage, go to the meeting point.', pastS: 'Thank you for travelling with us.', canceledS: 'Please message your driver so you can arrange a new time.',
    where: 'Where to meet', car: 'The car', pickup: 'Pick-up', route: 'Trip', flight: 'Your flight', landsAt: 'Arrives {t}', landedAt: 'Landed {t}', terminal: 'Terminal {x}', onTime: 'On time', late: '{m} min late', early: '{m} min early',
    local: 'local time', write: 'WhatsApp', call: 'Call', broken: 'This link is incomplete or has expired. Please ask your driver to send it again.', by: 'Powered by', steps: ['Booked', 'In the air', 'Landed', 'Picked up'],
  },
  es: {
    title: 'Tu traslado', hi: '¡Hola, {n}!', hiNo: '¡Hola!', with: 'Tu conductor es {d}.',
    later: 'Tu traslado está reservado', soon: 'Tu traslado es hoy', flying: 'Tu vuelo está de camino', landed: '¡Bienvenido/a! Tu vuelo ha aterrizado', past: 'Este traslado ha terminado', canceled: 'Tu vuelo aparece cancelado o desviado',
    laterS: 'Todo está listo. Tu conductor te estará esperando.', soonS: 'Tu conductor sigue tu vuelo y llegará a tiempo.', flyingS: 'Tu conductor sigue tu vuelo en directo. No te preocupes por los retrasos.', landedS: 'Cuando recojas tu equipaje, ve al punto de encuentro.', pastS: 'Gracias por viajar con nosotros.', canceledS: 'Escribe a tu conductor para acordar una nueva hora.',
    where: 'Punto de encuentro', car: 'El coche', pickup: 'Recogida', route: 'Trayecto', flight: 'Tu vuelo', landsAt: 'Llega a las {t}', landedAt: 'Aterrizó a las {t}', terminal: 'Terminal {x}', onTime: 'En hora', late: '{m} min tarde', early: '{m} min antes',
    local: 'hora local', write: 'WhatsApp', call: 'Llamar', broken: 'Este enlace está incompleto o ha caducado. Pide a tu conductor que te lo vuelva a enviar.', by: 'Con la tecnología de', steps: ['Reservado', 'En el aire', 'Aterrizado', 'Recogido'],
  },
  de: {
    title: 'Ihr Transfer', hi: 'Hallo {n}!', hiNo: 'Hallo!', with: 'Ihr Fahrer ist {d}.',
    later: 'Ihr Transfer ist gebucht', soon: 'Ihr Transfer ist heute', flying: 'Ihr Flug ist unterwegs', landed: 'Willkommen! Ihr Flug ist gelandet', past: 'Dieser Transfer ist beendet', canceled: 'Ihr Flug ist gestrichen oder umgeleitet',
    laterS: 'Alles ist bereit. Ihr Fahrer wird auf Sie warten.', soonS: 'Ihr Fahrer verfolgt Ihren Flug und ist pünktlich da.', flyingS: 'Ihr Fahrer verfolgt Ihren Flug live. Keine Sorge wegen Verspätungen.', landedS: 'Wenn Sie Ihr Gepäck haben, gehen Sie zum Treffpunkt.', pastS: 'Vielen Dank, dass Sie mit uns gereist sind.', canceledS: 'Bitte schreiben Sie Ihrem Fahrer, um eine neue Zeit zu vereinbaren.',
    where: 'Treffpunkt', car: 'Das Auto', pickup: 'Abholung', route: 'Fahrt', flight: 'Ihr Flug', landsAt: 'Ankunft {t}', landedAt: 'Gelandet {t}', terminal: 'Terminal {x}', onTime: 'Pünktlich', late: '{m} Min. später', early: '{m} Min. früher',
    local: 'Ortszeit', write: 'WhatsApp', call: 'Anrufen', broken: 'Dieser Link ist unvollständig oder abgelaufen. Bitten Sie Ihren Fahrer, ihn erneut zu senden.', by: 'Bereitgestellt von', steps: ['Gebucht', 'In der Luft', 'Gelandet', 'Abgeholt'],
  },
  fr: {
    title: 'Votre transfert', hi: 'Bonjour {n} !', hiNo: 'Bonjour !', with: 'Votre chauffeur est {d}.',
    later: 'Votre transfert est réservé', soon: 'Votre transfert est aujourd\'hui', flying: 'Votre vol est en route', landed: 'Bienvenue ! Votre vol a atterri', past: 'Ce transfert est terminé', canceled: 'Votre vol apparaît annulé ou dérouté',
    laterS: 'Tout est prêt. Votre chauffeur vous attendra.', soonS: 'Votre chauffeur suit votre vol et sera là à l\'heure.', flyingS: 'Votre chauffeur suit votre vol en direct. Pas d\'inquiétude en cas de retard.', landedS: 'Une fois vos bagages récupérés, rendez-vous au point de rencontre.', pastS: 'Merci d\'avoir voyagé avec nous.', canceledS: 'Écrivez à votre chauffeur pour convenir d\'un nouvel horaire.',
    where: 'Point de rencontre', car: 'La voiture', pickup: 'Prise en charge', route: 'Trajet', flight: 'Votre vol', landsAt: 'Arrivée {t}', landedAt: 'Atterri à {t}', terminal: 'Terminal {x}', onTime: 'À l\'heure', late: '{m} min de retard', early: '{m} min d\'avance',
    local: 'heure locale', write: 'WhatsApp', call: 'Appeler', broken: 'Ce lien est incomplet ou a expiré. Demandez à votre chauffeur de le renvoyer.', by: 'Propulsé par', steps: ['Réservé', 'En vol', 'Atterri', 'Pris en charge'],
  },
};

/** Paso de la barra de progreso (0–3) para cada momento. */
export const STEP = { later: 0, soon: 0, canceled: 0, flying: 1, landed: 2, past: 3 };

/** Mensaje de WhatsApp con el enlace, en el idioma del cliente. */
export function linkMessage(lang, s, cfg, url) {
  const n = firstName(s.pa);
  const d = driverName(cfg);
  const m = {
    en: (n ? 'Hi ' + n + '! ' : 'Hi! ') + (d ? 'I\'m ' + d + ', your driver. ' : '') + 'Here you can see where we meet, my car and your flight:',
    es: (n ? '¡Hola, ' + n + '! ' : '¡Hola! ') + (d ? 'Soy ' + d + ', tu conductor. ' : '') + 'Aquí tienes dónde nos vemos, mi coche y tu vuelo:',
    de: (n ? 'Hallo ' + n + '! ' : 'Hallo! ') + (d ? 'Ich bin ' + d + ', Ihr Fahrer. ' : '') + 'Hier sehen Sie unseren Treffpunkt, mein Auto und Ihren Flug:',
    fr: (n ? 'Bonjour ' + n + ' ! ' : 'Bonjour ! ') + (d ? 'Je suis ' + d + ', votre chauffeur. ' : '') + 'Voici notre point de rencontre, ma voiture et votre vol :',
  };
  return (m[lang] || m.en) + '\n' + url;
}
