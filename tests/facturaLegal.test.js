import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientProblems, fingerprint, issuerProblems, nextRectNumber, recordString, validNif, verifyChain } from '../js/facturaLegal.js';
import { invoiceTotals, nextInvoiceNumber } from '../js/money.js';

test('NIF, NIE y CIF con su control', () => {
  for (const ok of ['12345678Z', '12345678-z', 'X1234567L', 'B12345674', 'Q2826000H']) assert.equal(validNif(ok), true, ok);
  for (const bad of ['12345678A', 'X1234567A', 'B12345675', '', '1234']) assert.equal(validNif(bad), false, bad);
});

test('no deja emitir sin los datos obligatorios', () => {
  assert.deepEqual(issuerProblems({ nom: 'A', nif: '12345678Z', dir: 'C/ Larios 1', loc: 'Málaga', iva: 10 }), []);
  assert.ok(issuerProblems({ nom: 'A', nif: '12345678A', dir: 'x', loc: 'y', iva: 10 }).some((p) => /NIF válido/.test(p)));
  assert.ok(issuerProblems({ nom: 'A', nif: '12345678Z', dir: 'x', loc: 'y', iva: 0 }).some((p) => /motivo/.test(p)));
  assert.equal(clientProblems({ nom: 'Agencia Sol', nif: 'B12345674', dir: 'Av. Andalucía 3' }).length, 0);
  assert.equal(clientProblems({ nom: 'Agencia Sol' }).length, 2);
  assert.equal(clientProblems({ nom: 'Juan Pérez', part: true }).length, 0);
});

test('huella: ejemplo oficial de la AEAT', async () => {
  const inv = { em: { nif: '89890001K' }, num: '12345678/G33', fecha: '2024-01-01', tipo: 'F1' };
  const s = recordString(inv, { v: 12.35, t: 123.45 }, '', '2024-01-01T19:20:30+01:00');
  assert.equal(s, 'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00');
  assert.equal(await fingerprint(s), '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
});

test('la cadena detecta una factura alterada', async () => {
  const mk = async (num, prev, i) => {
    const f = { em: { nif: '12345678Z' }, num, fecha: '2026-11-20', tipo: 'F1', iva: 10, items: [{ i }], gen: '2026-11-20T10:00:00+01:00', prev };
    f.huella = await fingerprint(recordString(f, invoiceTotals(f), prev, f.gen));
    return f;
  };
  const a = await mk('001', '', 55);
  const b = await mk('002', a.huella, 80);
  assert.deepEqual(await verifyChain([a, b], invoiceTotals), []);
  b.items[0].i = 60; // alguien cambia el importe
  assert.deepEqual(await verifyChain([a, b], invoiceTotals), ['002']);
});

test('numeración: las rectificativas van en su propia serie', () => {
  const fac = [{ num: '007' }, { num: 'R-001', tipo: 'R4' }];
  assert.equal(nextRectNumber(fac), 'R-002');
  assert.equal(nextInvoiceNumber(0, fac.filter((f) => !f.tipo || f.tipo === 'F1')), '008');
});

import { chainOrder, duplicateNumbers, lastHash as lastHashOf } from '../js/facturaLegal.js';

test('la cadena de huellas va por fecha de emisión, no por el orden de la lista (al bajar de la nube llegan por id)', () => {
  const a = { id: 'z9', num: '001', huella: 'H1', gen: '2026-11-01T10:00:00+01:00' };
  const b = { id: 'a1', num: '002', huella: 'H2', gen: '2026-11-02T10:00:00+01:00' };
  const c = { id: 'm5', num: '003', huella: 'H3', gen: '2026-11-03T10:00:00+01:00' };
  assert.deepEqual(chainOrder([b, c, a]).map((f) => f.num), ['001', '002', '003']);
  assert.equal(lastHashOf([c, a, b]), 'H3', 'la última es la más reciente, esté donde esté en la lista');
});

test('números repetidos (dos móviles sin conexión): se detectan por serie; anulando una queda resuelto', () => {
  const f = (id, num, gen, extra = {}) => ({ id, num, tipo: 'F1', gen, ...extra });
  const inv = [f('x', '004', '2026-11-01T10:00:00Z'), f('y', '005', '2026-11-02T10:00:00Z'), f('z', '005', '2026-11-02T10:05:00Z'), { id: 'r', num: '005', tipo: 'R4', gen: '2026-11-03T10:00:00Z' }];
  const d = duplicateNumbers(inv);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0], { num: '005', serie: 'F', ids: ['y', 'z'] }, 'la rectificativa R es otra serie; de la más antigua a la más nueva');
  inv[2].anulada = 'R-001';
  assert.deepEqual(duplicateNumbers(inv), [], 'anulada la repetida, ya no se avisa');
});
