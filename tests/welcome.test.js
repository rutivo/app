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
