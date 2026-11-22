// Mensajes rápidos al cliente: datos del servicio puestos solos, 4 idiomas y
// sin huecos si falta un dato.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUICK, allTemplates, buildMessage, usesField } from '../js/mensajes.js';

const s = { id: 's1', f: '2026-11-23', h: '09:30', pa: 'MR JOHN SMITH', vu: 'BA490', o: 'Aeropuerto de Málaga', d: 'Marbella', tl: '+44 7700 900123' };
const cfg = { nom: 'Antonio Ruiz', punto: 'la cafetería de llegadas', coche: 'Toyota Corolla blanco', mat: '1234abc' };

test('todas las plantillas de serie en 4 idiomas, con los mismos datos en cada idioma', () => {
  for (const t of QUICK) {
    for (const l of ['es', 'en', 'de', 'fr']) assert.ok(t[l] && t[l].length > 20, t.id + ' ' + l);
    const keys = (x) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const l of ['en', 'de', 'fr']) assert.equal(keys(t[l]), keys(t.es), t.id + ' ' + l);
  }
});

test('se rellenan solos: nombre de pila, conductor, punto, vuelo, hora, minutos y coche', () => {
  assert.equal(buildMessage('llegadas', s, cfg, { lang: 'es' }), 'Hola John, soy Antonio, tu conductor. Ya estoy en llegadas esperándote con un cartel con tu nombre. Te espero en la cafetería de llegadas.');
  assert.equal(buildMessage('llego', s, cfg, { lang: 'en', min: 15 }), 'Hi John, this is Antonio. I\'ll be there in 15 minutes.');
  assert.match(buildMessage('retraso', s, cfg, { lang: 'de', arrival: '10:42' }), /Ihr Flug BA490 landet um 10:42\./);
  assert.equal(buildMessage('coche', s, cfg, { lang: 'fr' }), 'Je vous attends dans une Toyota Corolla blanco, immatriculée 1234ABC.');
  assert.match(buildMessage('confirmar', s, cfg, { lang: 'es' }), /el 23\/11\/2026 a las 09:30 en Aeropuerto de Málaga, con destino Marbella/);
});

test('si falta un dato, esa frase no se envía (nunca huecos ni {llaves})', () => {
  const sinPunto = buildMessage('llegadas', s, { nom: 'Antonio Ruiz' }, { lang: 'es' });
  assert.ok(!/\{|\}|Te espero en\s*\./.test(sinPunto) && !sinPunto.includes('undefined'), sinPunto);
  assert.equal(buildMessage('retraso', s, cfg, { lang: 'es' }), 'No te preocupes, sigo tu vuelo y te espero.', 'sin hora de llegada no dice «llega a las»');
  assert.equal(buildMessage('coche', s, { nom: 'A' }, { lang: 'es' }), '');
  for (const t of QUICK) for (const l of ['es', 'en', 'de', 'fr']) assert.ok(!/\{\w+\}/.test(buildMessage(t.id, {}, {}, { lang: l })), t.id + ' ' + l);
});

test('tus plantillas: se guardan con {nombre} y salen para cada cliente', () => {
  const c = { ...cfg, msgs: [{ id: 'm1', title: 'Puerta 3', text: 'Hola {nombre}, estoy en la puerta 3.', lang: 'es' }] };
  assert.ok(allTemplates(c).some((t) => t.id === 'm1' && t.mine));
  assert.equal(buildMessage('m1', s, c, { lang: 'en' }), 'Hola John, estoy en la puerta 3.');
  assert.equal(usesField('llego', 'min', c), true);
  assert.equal(usesField('llegadas', 'min', c), false);
});
