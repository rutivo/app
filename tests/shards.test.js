import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_DOC_BYTES, buildShards, bytesOf, chunkInvoices, classifyError, joinShards, legacyInvoices, shardLabel } from '../js/sync/shards.js';

const LOGO = 'data:image/png;base64,' + 'A'.repeat(180000); // logo PNG grande (el máximo que guardaba la app)
const legacy = (n, year = '2026') => ({ id: 'f' + n, num: String(n).padStart(3, '0'), fecha: year + '-03-' + String(10 + (n % 18)).padStart(2, '0'), iva: 10,
  em: { nom: 'Antonio', nif: '12345678Z', dir: 'C/ Larios', limg: LOGO, huchas: [{ id: 'h' }], wen: 'Hello {nombre}', avisos: 1 },
  cl: { nom: 'Agencia', nif: 'B12345674', dir: 'Av. 1' }, items: [{ f: year + '-03-01', o: 'Aeropuerto', d: 'Marbella', i: 60 }] });
const nueva = (n) => ({ id: 'n' + n, num: String(n).padStart(3, '0'), fecha: '2026-11-1' + (n % 9), iva: 10, tipo: 'F1',
  em: { nom: 'Antonio', nif: '12345678Z', dir: 'C/ Larios', cp: '', loc: 'Málaga', lic: '', iban: '', ivaMot: '' }, cl: { nom: 'Agencia' }, items: [{ f: '2026-11-01', i: 50 }] });
const base = (fac) => ({ mov: [{ id: 'm1', f: '2026-11-02', t: 'in', p: 'efectivo', i: 10, c: 'Carrera' }], srv: [], gas: [], huc: [], prv: [], jor: [], cli: {}, cfg: { nom: 'Antonio', limg: LOGO }, fac });

test('detecta las facturas antiguas con copia completa de ajustes y logo', () => {
  const found = legacyInvoices([legacy(1), nueva(2)]);
  assert.equal(found.length, 1);
  assert.equal(found[0].num, '001');
  assert.ok(found[0].logoBytes >= 180000);
  assert.deepEqual(found[0].extraKeys.sort(), ['avisos', 'huchas', 'limg', 'wen']);
});

test('antes: 8 facturas antiguas con logo en un año pasaban de 1 MB en un solo documento', () => {
  const all = Array.from({ length: 8 }, (_, i) => legacy(i + 1));
  assert.ok(bytesOf(JSON.stringify(all)) > 1000000);
});

test('ahora: se reparten en varios documentos, ninguno pasa del límite, y no se pierde ni se cambia ninguna', () => {
  const fac = [...Array.from({ length: 8 }, (_, i) => legacy(i + 1)), nueva(20), nueva(21)];
  const { docs, keep, problems } = buildShards(base(fac));
  const facKeys = Object.keys(docs).filter((k) => k.startsWith('fac-')).sort();
  assert.ok(facKeys.length >= 2, 'varios documentos');
  assert.ok(facKeys.every((k) => /^fac-[0-9a-z-]{3,7}$/.test(k)), 'nombres que admiten las reglas actuales');
  for (const k of Object.keys(docs)) assert.ok(bytesOf(docs[k]) <= MAX_DOC_BYTES, k + ' cabe');
  assert.deepEqual(problems, []);
  assert.deepEqual(keep, []);
  // Ida y vuelta: exactamente las mismas facturas, intactas (con su logo y sus datos originales)
  const { R } = joinShards(Object.entries(docs).map(([id, j]) => ({ id, data: { j } })));
  const sortId = (l) => [...l].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sortId(R.fac), sortId(fac));
  assert.equal(R.mov.length, 1);
});

test('el reparto es estable (los mismos datos dan los mismos documentos)', () => {
  const fac = Array.from({ length: 9 }, (_, i) => legacy(i + 1));
  const a = buildShards(base(fac)).docs;
  const b = buildShards(base([...fac].reverse())).docs;
  assert.deepEqual(a, b);
});

test('pocas facturas: un solo documento con el nombre de siempre («fac-2026»)', () => {
  const { docs } = buildShards(base([nueva(1), nueva(2)]));
  assert.deepEqual(Object.keys(docs).filter((k) => k.startsWith('fac-')), ['fac-2026']);
});

test('una factura que no cabe sola: no se sube ese año, NO se borra de la nube, y se avisa', () => {
  const huge = { ...legacy(5), em: { ...legacy(5).em, limg: 'x'.repeat(MAX_DOC_BYTES + 10) } };
  const { docs, keep, problems } = buildShards(base([legacy(1), huge, legacy(2, '2025')]));
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'invoice-too-big');
  assert.equal(problems[0].num, '005');
  assert.ok(!('fac-2026' in docs), 'el año con problema no se reescribe');
  assert.ok(keep.includes('fac-2026') && keep.includes('fac-2026-1'), 'sus documentos se conservan en la nube');
  assert.ok('fac-2025' in docs, 'los demás años sí se suben');
});

test('cualquier otro documento demasiado grande: no se sube, no se borra y se avisa', () => {
  const big = base([]);
  big.mov = Array.from({ length: 4000 }, (_, i) => ({ id: 'm' + i, f: '2026-11-03', t: 'in', p: 'efectivo', i: 1, c: 'x'.repeat(300) }));
  const { docs, keep, problems } = buildShards(big);
  assert.ok(!('mov-2026-11' in docs));
  assert.ok(keep.includes('mov-2026-11'));
  assert.equal(problems[0].kind, 'doc-too-big');
});

test('lee el formato antiguo (un documento por año) y el nuevo (varios)', () => {
  const f1 = legacy(1); const f2 = legacy(2); const f3 = nueva(3);
  const old = joinShards([{ id: 'fac-2026', data: { j: JSON.stringify([f1, f2, f3]) } }, { id: 'meta', data: { ts: 5 } }]);
  const neu = joinShards([{ id: 'fac-2026', data: { j: JSON.stringify([f1]) } }, { id: 'fac-2026-1', data: { j: JSON.stringify([f2, f3]) } }, { id: 'meta', data: { ts: 5 } }]);
  assert.deepEqual(old.R.fac, neu.R.fac);
  assert.equal(neu.R.ts, 5);
});

test('chunkInvoices respeta el límite que se le pida', () => {
  const { chunks } = chunkInvoices(Array.from({ length: 6 }, (_, i) => legacy(i + 1)), 400000);
  assert.ok(chunks.every((c) => bytesOf(JSON.stringify(c)) <= 400000));
  assert.equal(chunks.flat().length, 6);
});

test('errores de la nube bien clasificados (no todo es «sin conexión»)', () => {
  assert.equal(classifyError({ code: 'unavailable' }), 'offline');
  assert.equal(classifyError(new TypeError('Failed to fetch')), 'offline');
  assert.equal(classifyError({ code: 'permission-denied' }), 'denied');
  assert.equal(classifyError({ code: 'invalid-argument', message: 'Document exceeds maximum size' }), 'too-big');
  assert.equal(classifyError({ code: 'resource-exhausted' }), 'quota');
  assert.equal(classifyError({ code: 'permission-denied' }, false), 'offline');
});

test('nombres legibles de los documentos', () => {
  assert.equal(shardLabel('fac-2026-1'), 'Facturas de 2026');
  assert.equal(shardLabel('mov-2026-11'), 'Caja de 11/2026');
});
