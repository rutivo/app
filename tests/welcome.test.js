import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillTemplate, welcomeMessage, welcomeSendTime } from '../js/welcome.js';

const service = { pa: 'Heidi Sachmann', vu: 'D85071', sv: '14:00', d: 'Elviria', f: '2026-10-27', h: '15:30' };

test('rellena los datos de la plantilla', () => {
  const t = fillTemplate('Hola {nombre}. Vuelo {vuelo} el {fecha}.', service, {});
  assert.equal(t, 'Hola Heidi. Vuelo D85071 el 27/10/2026.');
});

test('quita las frases con datos vacíos', () => {
  const t = fillTemplate('Hola {nombre}. Soy {chofer}. Hasta pronto.', service, { chof: '' });
  assert.equal(t, 'Hola Heidi. Hasta pronto.');
});

test('mensaje por defecto en inglés y español', () => {
  const m = welcomeMessage(service, { chof: 'Luis', punto: 'llegadas' });
  assert.match(m, /^Hello Heidi! Welcome\. My name is Luis/);
  assert.match(m, /\n\n¡Hola Heidi! Bienvenido\/a\. Me llamo Luis/);
});

test('un mensaje vacío por el usuario no se envía', () => {
  assert.equal(welcomeMessage(service, { wen: '', wes: 'Hola {nombre}.' }), 'Hola Heidi.');
});

test('la bienvenida se manda una hora antes del vuelo', () => {
  assert.equal(welcomeSendTime('14:00'), '13:00');
  assert.equal(welcomeSendTime('00:30'), '23:30');
  assert.equal(welcomeSendTime(''), '');
});

test('solo el nombre de pila del pasajero, sin tratamientos ni símbolos', async () => {
  const { firstName } = await import('../js/welcome.js');
  assert.equal(firstName('MR RICHARD SMITH'), 'Richard');
  assert.equal(firstName('Mrs. Sien Vanhauwaert &_'), 'Sien');
  assert.equal(firstName('** JOHN SMITH **'), 'John');
  assert.equal(firstName('Dr. Anne-marie Dupont'), 'Anne-Marie');
  assert.equal(firstName('josé maría'), 'José');
  assert.equal(firstName(''), '');
});

test('el conductor sale de la cuenta (nombre de pila) si no ha puesto otro', async () => {
  const { driverName } = await import('../js/welcome.js');
  assert.equal(driverName({ nom: 'Alejandro García López' }), 'Alejandro');
  assert.equal(driverName({ nom: 'Alejandro García', chof: 'Álex' }), 'Álex');
});

test('mensaje preparado: Hola Richard, soy Alejandro… punto de encuentro elegido', async () => {
  const { buildWelcome } = await import('../js/welcome.js');
  const s = { pa: 'MR RICHARD SMITH', vu: 'FR4250', d: 'Marbella', h: '15:30' };
  const cfg = { nom: 'Alejandro García', punto: 'llegadas, puerta 3', loc: 'Málaga' };
  const es = buildWelcome(s, cfg, { preset: 'cercano', lang: 'es', punto: 'el restaurante La Mano' });
  assert.equal(es, '¡Hola Richard! Soy Alejandro, tu conductor. Estaré encantado de llevarte hoy a tu destino de forma segura. Nos encontraremos en el restaurante La Mano una vez aterrices, ¿vale? ¡Hasta ahora!');
  const formal = buildWelcome(s, cfg, { preset: 'formal', lang: 'en' });
  assert.match(formal, /^Good afternoon, Richard\. My name is Alejandro/);
  assert.match(formal, /to Marbella\. I will be waiting for you at llegadas, puerta 3/);
  const vip = buildWelcome(s, cfg, { preset: 'vip', lang: 'es' });
  assert.match(vip, /bienvenido\/a a Málaga/);
  const both = buildWelcome(s, cfg, { preset: 'corto', lang: 'ambos' });
  assert.equal(both.split('\n\n').length, 2);
});

test('sin punto de encuentro no se envía esa frase', async () => {
  const { buildWelcome } = await import('../js/welcome.js');
  const m = buildWelcome({ pa: 'Ana' }, { nom: 'Alejandro' }, { preset: 'cercano', lang: 'es', punto: '' });
  assert.ok(!m.includes('Nos encontraremos'));
  assert.ok(m.startsWith('¡Hola Ana! Soy Alejandro'));
});
