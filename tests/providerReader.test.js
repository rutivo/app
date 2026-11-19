import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readProvider } from '../js/providerReader.js';

test('el membrete de tu foto: empresa, CIF, dirección, localidad y CP', () => {
  const ocr = 'Transfer Erkaitand S.L.U.\nB87355517\nCalle Ruperto Anduez Nº8 Nerja\nMálaga\n29780';
  assert.deepEqual(readProvider(ocr), { nom: 'Transfer Erkaitand S.L.U.', nif: 'B87355517', dir: 'Calle Ruperto Anduez Nº8', cp: '29780', loc: 'Nerja' });
});

test('con etiquetas y CP junto a la localidad', () => {
  const t = 'Razón social: VIAJES COSTA SL\nCIF: B-29111111\nDirección: Av. de Andalucía 25\n29007 Málaga\nTel: 952 000 000';
  assert.deepEqual(readProvider(t), { nom: 'Viajes Costa Sl', nif: 'B29111111', dir: 'Av. de Andalucía 25', cp: '29007', loc: 'Málaga' });
});

test('autónomo con DNI', () => {
  const r = readProvider('Antonio Pérez Gómez\nNIF 12345678Z\nC/ Larios 10\n29005 Málaga');
  assert.equal(r.nom, 'Antonio Pérez Gómez');
  assert.equal(r.nif, '12345678Z');
  assert.equal(r.dir, 'C/ Larios 10');
  assert.equal(r.cp, '29005');
});

test('la lectura confunde «Nº» con «N%»', () => {
  assert.equal(readProvider('Transfer X S.L.\nB12345678\nCalle Mayor N%8 Nerja\n29780').dir, 'Calle Mayor Nº8');
});

test('sin datos útiles', () => {
  assert.equal(readProvider('hola'), null);
});
