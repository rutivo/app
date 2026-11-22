// Enlace para el cliente: datos dentro del enlace, a prueba de enlaces manipulados,
// hora de España sea cual sea el móvil, y en qué punto está el servicio.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEP, T, clientUrl, decodeLink, encodeLink, linkData, linkMessage, shouldAskFlight, spainClock, spainTime, stageOf } from '../js/enlace.js';

const s = { id: 's1', f: '2026-11-23', h: '10:30', pa: 'MR JOHN SMITH', vu: 'ba 490', o: 'Aeropuerto de Málaga T3', d: 'Puente Romano, Marbella', tl: '+44 7700 900123', i: 95, cl: 'SunTours' };
const cfg = { nom: 'Alejandro Fernández', punto: 'Terminal 3, puerta 3', coche: 'Toyota Corolla blanco', mat: '1234abc', tel: '+34 600 11 22 33', nif: '12345678Z' };

test('el enlace lleva solo lo que necesita el cliente (sin precio, proveedor ni tus datos fiscales)', () => {
  const d = linkData(s, cfg, 'en');
  assert.deepEqual(d, { l: 'en', n: 'John', d: 'Alejandro', t: '+34600112233', c: 'Toyota Corolla blanco', m: '1234ABC', p: 'Terminal 3, puerta 3', f: 'BA490', dt: '2026-11-23', h: '10:30', o: 'Aeropuerto de Málaga T3', de: 'Puente Romano, Marbella' });
  const all = JSON.stringify(d);
  for (const secret of ['95', 'SunTours', '12345678Z', '7700']) assert.ok(!all.includes(secret), secret);
});

test('ida y vuelta: lo que se codifica se lee igual, con tildes y emojis', () => {
  const d = { ...linkData(s, cfg, 'es'), p: 'Cafetería «Mañana» 🚖' };
  assert.deepEqual(decodeLink('#' + encodeLink(d)), d);
  const url = clientUrl('https://rutivo.github.io/app/', d);
  assert.ok(url.startsWith('https://rutivo.github.io/app/cliente.html#'));
  assert.ok(!/[^A-Za-z0-9_\-:/.#]/.test(url), 'el enlace no tiene caracteres que WhatsApp pueda romper');
});

test('un enlace roto o manipulado no rompe nada: campos raros fuera, tamaños limitados', () => {
  assert.equal(decodeLink(''), null);
  assert.equal(decodeLink('#%%%'), null);
  assert.equal(decodeLink('#' + Buffer.from('{"v":2,"d":"x"}').toString('base64url')), null);
  const evil = Buffer.from(JSON.stringify({ v: 1, d: '<img src=x onerror=alert(1)>', z: 'extra', f: 'X"><script>', t: 'javascript:alert(1)', dt: '2026-13-99x', l: 'xx', p: 'a'.repeat(999), h: { a: 1 } })).toString('base64url');
  const d = decodeLink('#' + evil);
  assert.equal(d.d, '<img src=x onerror=alert(1)>'); // se queda como texto (la página lo pinta con textContent)
  assert.equal(d.z, undefined);
  assert.equal(d.f, undefined);
  assert.equal(d.t, undefined);
  assert.equal(d.dt, undefined);
  assert.equal(d.h, undefined);
  assert.equal(d.l, 'en');
  assert.equal(d.p.length, 140);
});

test('la hora es la de España aunque el cliente abra el enlace en Londres o Berlín', () => {
  assert.equal(new Date(spainTime('2026-11-23', '10:30')).toISOString(), '2026-11-23T09:30:00.000Z'); // invierno: +1
  assert.equal(new Date(spainTime('2026-07-10', '10:30')).toISOString(), '2026-07-10T08:30:00.000Z'); // verano: +2
  assert.equal(spainClock(Date.parse('2026-11-23T09:42:00Z')), '10:42');
  assert.equal(spainTime('', '10:30'), null);
});

test('en qué punto está: reservado, hoy, en el aire, aterrizado, terminado, cancelado', () => {
  const d = linkData(s, cfg, 'en');
  const pick = spainTime(d.dt, d.h);
  const h = 36e5;
  assert.equal(stageOf(d, null, pick - 24 * h), 'later');
  assert.equal(stageOf(d, null, pick - 2 * h), 'soon');
  assert.equal(stageOf(d, { found: true, status: 'EnRoute', arr: {} }, pick - h), 'flying');
  assert.equal(stageOf(d, { found: true, status: 'Expected', arr: { runway: '2026-11-23T09:42:00Z' } }, pick), 'landed');
  assert.equal(stageOf(d, { found: true, status: 'Canceled' }, pick - h), 'canceled');
  assert.equal(stageOf(d, null, pick + 5 * h), 'past');
  // Nunca dice «tu conductor ya está»: eso solo lo sabe el conductor
  for (const l of Object.values(T)) for (const k of ['later', 'soon', 'flying', 'landed']) assert.ok(!/is here|ya está|ist da|est là/i.test(l[k] + l[k + 'S']), k);
  assert.equal(STEP.landed, 2);
});

test('solo se pregunta por el vuelo cerca de la hora (no se gastan consultas)', () => {
  const d = linkData(s, cfg, 'en');
  const pick = spainTime(d.dt, d.h);
  assert.equal(shouldAskFlight(d, pick - 24 * 36e5), false);
  assert.equal(shouldAskFlight(d, pick - 2 * 36e5), true);
  assert.equal(shouldAskFlight(d, pick + 5 * 36e5), false);
  assert.equal(shouldAskFlight({ ...d, f: undefined }, pick), false);
});

test('textos completos en los 4 idiomas y mensaje de WhatsApp con el enlace', () => {
  const keys = Object.keys(T.en).sort().join();
  for (const l of ['es', 'de', 'fr']) assert.equal(Object.keys(T[l]).sort().join(), keys, l);
  const m = linkMessage('de', s, cfg, 'https://x/cliente.html#abc');
  assert.equal(m, 'Hallo John! Ich bin Alejandro, Ihr Fahrer. Hier sehen Sie unseren Treffpunkt, mein Auto und Ihren Flug:\nhttps://x/cliente.html#abc');
});

test('foto del punto de encuentro: va al final del enlace y solo se acepta una JPEG pequeña', async () => {
  const { photoPart, PHOTO_MAX } = await import('../js/enlace.js');
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ+/abc=';
  const d = linkData(s, cfg, 'en');
  const url = clientUrl('https://rutivo.github.io/app/', d, jpeg);
  const hash = url.split('#')[1];
  assert.match(hash, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const back = decodeLink('#' + hash);
  assert.equal(back.ph, jpeg);
  assert.equal(back.n, 'John');
  // No vale: otra cosa que no sea JPEG, SVG (podría llevar código), o demasiado grande
  assert.equal(photoPart('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(photoPart('data:image/png;base64,iVBORw0KGgo='), '');
  assert.equal(photoPart('data:image/jpeg;base64,/9j/' + 'A'.repeat(PHOTO_MAX)), '');
  assert.equal(decodeLink('#' + hash.split('.')[0] + '.PHN2Zz4').ph, undefined);
  assert.equal(decodeLink('#' + hash.split('.')[0] + '.<script>').ph, undefined);
  // Sin foto, el enlace es como antes
  assert.ok(!clientUrl('https://x/', d).includes('.', 'https://x/cliente.html'.length));
});

test('enlace corto: código secreto de 20 letras/números, distinto cada vez', async () => {
  const { newLinkId, isLinkId, shortUrl } = await import('../js/enlace.js');
  const ids = new Set(Array.from({ length: 2000 }, newLinkId));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.ok(isLinkId(id), id);
  assert.equal(isLinkId('corto'), false);
  assert.equal(isLinkId('AbCdEfGhIjKlMnOpQrS!'), false);
  const url = shortUrl('https://rutivo.github.io/app/', 'AbCdEfGhIjKlMnOpQrSt');
  assert.equal(url, 'https://rutivo.github.io/app/cliente.html#AbCdEfGhIjKlMnOpQrSt');
  assert.ok(url.length < 70, 'enlace corto de verdad: ' + url.length);
});

test('lo que se guarda en la nube y su caducidad (2 días tras el servicio, nunca más de 44)', async () => {
  const { linkRecord, linkExpiry, spainTime: st } = await import('../js/enlace.js');
  const d = linkData(s, cfg, 'en');
  const rec = linkRecord(d, 'data:image/jpeg;base64,/9j/AAAA');
  assert.deepEqual(Object.keys(rec).sort(), ['d', 'ph']);
  assert.deepEqual(JSON.parse(rec.d), { v: 1, ...d });
  assert.ok(!/95|SunTours|12345678Z/.test(JSON.stringify(rec)));
  assert.equal(linkRecord(d, 'data:image/png;base64,iVBOR').ph, undefined);
  const now = st('2026-11-20', '12:00');
  assert.equal(linkExpiry(d, now), st('2026-11-23', '10:30') + 2 * 864e5);
  assert.equal(linkExpiry({ l: 'en' }, now), now + 30 * 864e5);
  assert.equal(linkExpiry({ ...d, dt: '2027-06-01' }, now), now + 44 * 864e5);
});

test('leer el enlace de la nube (API REST): igual de comprobado, y caducado = nada', async () => {
  const { fromRest } = await import('../js/enlace.js');
  const d = linkData(s, cfg, 'es');
  const future = new Date(Date.now() + 864e5).toISOString();
  const doc = { fields: { d: { stringValue: JSON.stringify({ v: 1, ...d, z: 'extra', f: '"><script>' }) }, ph: { stringValue: '/9j/AAAA' }, exp: { timestampValue: future }, o: { stringValue: 'u1' } } };
  const got = fromRest(doc);
  assert.equal(got.n, 'John');
  assert.equal(got.z, undefined);
  assert.equal(got.f, undefined);
  assert.equal(got.ph, 'data:image/jpeg;base64,/9j/AAAA');
  assert.ok(!JSON.stringify(got).includes('u1'), 'el dueño (su cuenta) no pasa a la página');
  assert.equal(fromRest({ fields: { ...doc.fields, exp: { timestampValue: new Date(Date.now() - 1000).toISOString() } } }), null);
  assert.equal(fromRest({}), null);
  assert.equal(fromRest({ fields: { ...doc.fields, d: { stringValue: 'no es json' } } }), null);
});
