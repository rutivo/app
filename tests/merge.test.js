import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstSyncSnapshot, hash, merge3, mergeTombs, sameState, snapshot, stable } from '../js/sync/merge.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const st = (over = {}) => ({ mov: [], srv: [], fac: [], gas: [], huc: [], prv: [], jor: [], cfg: { nom: 'Antonio', iva: 10 }, cli: {}, ...over });
const m = (id, i, c = 'Carrera', f = '2026-11-20') => ({ id, f, t: 'in', p: 'efectivo', i, c });
const clone = (x) => JSON.parse(JSON.stringify(x));
const ids = (l) => l.map((x) => x.id).sort();

test('huella estable: el orden de las claves no importa', () => {
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  assert.notEqual(hash({ a: 1 }), hash({ a: 2 }));
  assert.equal(stable({ b: [1, { d: 1, c: 2 }], a: null }), '{"a":null,"b":[1,{"c":2,"d":1}]}');
});

test('cada móvil añade cosas distintas: se juntan todas', () => {
  const base = st({ mov: [m('a', 10)] });
  const local = st({ mov: [m('a', 10), m('b', 20)] });
  const remote = st({ mov: [m('a', 10), m('c', 30)] });
  const r = merge3(snapshot(base), local, remote, {}, NOW);
  assert.deepEqual(ids(r.state.mov), ['a', 'b', 'c']);
  assert.equal(r.conflicts.length, 0);
});

test('cambiado solo en un lado: gana ese lado (no el más reciente a ciegas)', () => {
  const base = st({ mov: [m('a', 10), m('b', 20)] });
  const local = st({ mov: [m('a', 15), m('b', 20)] }); // aquí cambié «a»
  const remote = st({ mov: [m('a', 10), m('b', 25)] }); // en otro móvil cambiaron «b»
  const r = merge3(snapshot(base), local, remote, {}, NOW);
  assert.deepEqual(r.state.mov.map((x) => x.id + ':' + x.i), ['a:15', 'b:25']);
  assert.equal(r.conflicts.length, 0);
});

test('mismo registro, campos distintos en cada móvil: se juntan los dos cambios', () => {
  const base = st({ mov: [m('a', 10, 'Carrera')] });
  const local = st({ mov: [m('a', 12, 'Carrera')] }); // importe
  const remote = st({ mov: [m('a', 10, 'Carrera aeropuerto')] }); // concepto
  const r = merge3(snapshot(base), local, remote, {}, NOW);
  assert.deepEqual(r.state.mov[0], m('a', 12, 'Carrera aeropuerto'));
  assert.equal(r.conflicts.length, 0);
});

test('mismo campo cambiado en los dos: gana el de aquí y el otro queda apuntado (no se pierde en silencio)', () => {
  const base = st({ mov: [m('a', 10)] });
  const r = merge3(snapshot(base), st({ mov: [m('a', 12)] }), st({ mov: [m('a', 14)] }), {}, NOW);
  assert.equal(r.state.mov[0].i, 12);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual([r.conflicts[0].list, r.conflicts[0].id, r.conflicts[0].field, r.conflicts[0].local, r.conflicts[0].remote], ['mov', 'a', 'i', 12, 14]);
});

test('borrado aquí: se borra en la fusión y se deja lápida', () => {
  const base = st({ mov: [m('a', 10), m('b', 20)] });
  const r = merge3(snapshot(base), st({ mov: [m('a', 10)] }), clone(base), {}, NOW);
  assert.deepEqual(ids(r.state.mov), ['a']);
  assert.equal(r.tombs.mov.b, NOW);
});

test('borrado en otro móvil (con lápida): se borra aquí', () => {
  const base = st({ mov: [m('a', 10), m('b', 20)] });
  const r = merge3(snapshot(base), clone(base), st({ mov: [m('a', 10)] }), { mov: { b: NOW - 1000 } }, NOW);
  assert.deepEqual(ids(r.state.mov), ['a']);
});

test('falta en la nube SIN lápida (versión antigua de la app lo sobrescribió): NO se borra', () => {
  const base = st({ mov: [m('a', 10), m('b', 20)] });
  const r = merge3(snapshot(base), clone(base), st({ mov: [m('a', 10)] }), {}, NOW);
  assert.deepEqual(ids(r.state.mov), ['a', 'b']);
});

test('borrado aquí pero cambiado en otro móvil: se conserva y se avisa', () => {
  const base = st({ mov: [m('a', 10)] });
  const r = merge3(snapshot(base), st({ mov: [] }), st({ mov: [m('a', 99)] }), {}, NOW);
  assert.deepEqual(r.state.mov, [m('a', 99)]);
  assert.equal(r.conflicts[0].kind, 'deleted-here-changed-there');
});

test('borrado en otro móvil pero cambiado aquí: se conserva y se avisa', () => {
  const base = st({ mov: [m('a', 10)] });
  const r = merge3(snapshot(base), st({ mov: [m('a', 50)] }), st({ mov: [] }), { mov: { a: NOW } }, NOW);
  assert.deepEqual(r.state.mov, [m('a', 50)]);
  assert.equal(r.conflicts[0].kind, 'deleted-there-changed-here');
});

test('sin base (primera vez tras actualizar o móvil nuevo): se une todo, nada se borra', () => {
  const r = merge3(null, st({ mov: [m('a', 10), m('b', 20)] }), st({ mov: [m('b', 20), m('c', 30)] }), {}, NOW);
  assert.deepEqual(ids(r.state.mov), ['a', 'b', 'c']);
});

test('en un dispositivo nuevo, los valores iniciales no pisan los datos de cuenta guardados', () => {
  const local = st({ cfg: { nom: '', nif: '', dir: '', iva: 10, lic: '', cp: '', loc: '', ico: 'taxi', col: 'azul', hd: 1, hm: 500 } });
  const remote = st({ cfg: { nom: 'Alejandro', nif: '12345678Z', dir: 'C/ Larios 1', iva: 10, lic: '1274', cp: '29001', loc: 'Málaga', ico: 'taxi', col: 'azul', hd: 1, hm: 500 } });
  const base = firstSyncSnapshot(local, false, local.cfg);
  const r = merge3(base, local, remote, {}, NOW);
  assert.deepEqual(r.state.cfg, remote.cfg);
  assert.equal(r.conflicts.length, 0);
});

test('al migrar datos locales, los campos vacíos no pisan la ficha remota y los cambios propios se conservan', () => {
  const defaults = { nom: '', nif: '', dir: '', iva: 10, lic: '', cp: '', loc: '', ico: 'taxi', col: 'azul', hd: 1, hm: 500 };
  const local = st({ mov: [m('local', 10)], cfg: { ...defaults, lic: 'Licencia local' } });
  const remote = st({ cfg: { ...defaults, nom: 'Alejandro', nif: '12345678Z', iva: 21, lic: 'Licencia nube' } });
  const base = firstSyncSnapshot(local, true, defaults);
  const r = merge3(base, local, remote, {}, NOW);
  assert.equal(r.state.cfg.nom, 'Alejandro');
  assert.equal(r.state.cfg.nif, '12345678Z');
  assert.equal(r.state.cfg.iva, 21);
  assert.equal(r.state.cfg.lic, 'Licencia local');
  assert.equal(r.conflicts.length, 1);
});

test('ajustes y clientes: campo a campo (cada móvil cambia uno distinto)', () => {
  const base = st({ cfg: { nom: 'Antonio', iva: 10, lic: '1274' }, cli: { Sol: { nif: 'B1' } } });
  const local = st({ cfg: { nom: 'Antonio Ruiz', iva: 10, lic: '1274' }, cli: { Sol: { nif: 'B1' }, Costa: { nif: 'B2' } } });
  const remote = st({ cfg: { nom: 'Antonio', iva: 21, lic: '1274' }, cli: { Sol: { nif: 'B9' } } });
  const r = merge3(snapshot(base), local, remote, {}, NOW);
  assert.deepEqual(r.state.cfg, { nom: 'Antonio Ruiz', iva: 21, lic: '1274' });
  assert.deepEqual(r.state.cli, { Sol: { nif: 'B9' }, Costa: { nif: 'B2' } });
  assert.equal(r.conflicts.length, 0);
});

test('un ajuste borrado aquí (p. ej. quitar el logo) se borra; si lo cambiaron allí, se conserva', () => {
  const base = st({ cfg: { nom: 'A', limg: 'LOGO1' } });
  assert.equal(merge3(snapshot(base), st({ cfg: { nom: 'A' } }), clone(base), {}, NOW).state.cfg.limg, undefined);
  const r = merge3(snapshot(base), st({ cfg: { nom: 'A' } }), st({ cfg: { nom: 'A', limg: 'LOGO2' } }), {}, NOW);
  assert.equal(r.state.cfg.limg, 'LOGO2');
  assert.equal(r.conflicts.length, 1);
});

test('las lápidas antiguas se olvidan (120 días) y no borran algo que sigue vivo', () => {
  const t = mergeTombs({ mov: { a: NOW - 200 * 864e5, b: NOW } }, {}, NOW);
  assert.deepEqual(t, { mov: { b: NOW } });
  const base = st({ mov: [m('b', 1)] });
  const r = merge3(snapshot(base), st({ mov: [m('b', 5)] }), st({ mov: [] }), { mov: { b: NOW } }, NOW);
  assert.ok(!r.tombs.mov || !r.tombs.mov.b, 'el registro se conserva y su lápida se retira');
});

test('fusionar con lo mismo no cambia nada (idempotente)', () => {
  const a = st({ mov: [m('a', 1), m('b', 2)], cfg: { nom: 'X' } });
  const r = merge3(snapshot(a), clone(a), clone(a), {}, NOW);
  assert.ok(sameState(r.state, a));
  assert.equal(r.conflicts.length, 0);
});

test('facturas con logo: la fusión no las altera', () => {
  const f = { id: 'f1', num: '001', fecha: '2026-03-01', em: { nom: 'A', limg: 'data:image/png;base64,' + 'A'.repeat(1000) }, cl: { nom: 'C' }, items: [{ i: 10 }] };
  const r = merge3(null, st({ fac: [f] }), st({ fac: [clone(f)] }), {}, NOW);
  assert.deepEqual(r.state.fac, [f]);
});
