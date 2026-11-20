// Pruebas de las reglas REALES de Firestore (firestore.rules) con el emulador oficial.
// No toca el proyecto real (proyecto «demo-»). Uso (desde la raíz):
//   npx firebase emulators:exec --config tests/rules/firebase.json --project demo-rutivo "node tests/rules/reglas.test.mjs"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-rutivo', firestore: { rules, host: '127.0.0.1', port: 8085 } });
const res = [];
const t = async (name, p) => { try { await p; res.push(true); console.log('PASS ' + name); } catch (e) { res.push(false); console.log('FAIL ' + name + ' — ' + e.message); } };

const u1 = env.authenticatedContext('u1').firestore();
const u2 = env.authenticatedContext('u2').firestore();
const anon = env.unauthenticatedContext().firestore();
const d = (db, ...p) => doc(db, 'users', ...p);

// Datos de u1 (escritos saltándose las reglas, como si ya existieran)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/u1/data/mov-2026-11'), { j: '[]' });
  await setDoc(doc(db, 'users/u1/data/meta'), { ts: 1 });
  await setDoc(doc(db, 'users/u1/fotos/g1'), { d: 'data:image/jpeg;base64,AAAA' });
});

// ---- Cada usuario: lo suyo sí ----
await t('u1 lee sus datos', assertSucceeds(getDoc(d(u1, 'u1', 'data', 'mov-2026-11'))));
await t('u1 lista su colección', assertSucceeds(getDocs(collection(u1, 'users/u1/data'))));
await t('u1 guarda un mes', assertSucceeds(setDoc(d(u1, 'u1', 'data', 'mov-2026-12'), { j: '[{"id":"a"}]' })));
await t('u1 guarda facturas repartidas (fac-2026-1)', assertSucceeds(setDoc(d(u1, 'u1', 'data', 'fac-2026-1'), { j: '[]' })));
await t('u1 guarda la marca de versión', assertSucceeds(setDoc(d(u1, 'u1', 'data', 'meta'), { ts: 2 })));
await t('u1: transacción documentos + marca (sincronización nueva)', assertSucceeds(runTransaction(u1, async (tx) => {
  await tx.get(d(u1, 'u1', 'data', 'meta'));
  tx.set(d(u1, 'u1', 'data', 'srv-2026-11'), { j: '[]' });
  tx.set(d(u1, 'u1', 'data', 'meta'), { ts: 3 });
})));
await t('u1 borra un mes suyo', assertSucceeds(deleteDoc(d(u1, 'u1', 'data', 'mov-2026-12'))));
await t('u1 guarda una foto suya', assertSucceeds(setDoc(d(u1, 'u1', 'fotos', 'g2'), { d: 'data:image/jpeg;base64,BBBB' })));

// ---- Aislamiento: lo de otro, nunca ----
await t('u2 NO lee los datos de u1', assertFails(getDoc(d(u2, 'u1', 'data', 'mov-2026-11'))));
await t('u2 NO lista los datos de u1', assertFails(getDocs(collection(u2, 'users/u1/data'))));
await t('u2 NO escribe en u1', assertFails(setDoc(d(u2, 'u1', 'data', 'mov-2026-11'), { j: '[]' })));
await t('u2 NO borra datos de u1', assertFails(deleteDoc(d(u2, 'u1', 'data', 'meta'))));
await t('u2 NO lee las fotos de u1', assertFails(getDoc(d(u2, 'u1', 'fotos', 'g1'))));
await t('u2 NO transacciona sobre u1', assertFails(runTransaction(u2, async (tx) => { tx.set(d(u2, 'u1', 'data', 'meta'), { ts: 9 }); })));
await t('sin sesión: no lee', assertFails(getDoc(d(anon, 'u1', 'data', 'meta'))));
await t('sin sesión: no escribe', assertFails(setDoc(d(anon, 'u1', 'data', 'meta'), { ts: 9 })));

// ---- Forma y tamaño ----
await t('nombre de documento no permitido', assertFails(setDoc(d(u1, 'u1', 'data', 'malicioso'), { j: '[]' })));
await t('nombre demasiado largo (fac-2026-100)', assertFails(setDoc(d(u1, 'u1', 'data', 'fac-2026-100'), { j: '[]' })));
await t('campos extra no permitidos', assertFails(setDoc(d(u1, 'u1', 'data', 'mov-2026-10'), { j: '[]', admin: true })));
await t('«j» que no es texto', assertFails(setDoc(d(u1, 'u1', 'data', 'mov-2026-10'), { j: 5 })));
await t('«j» de 1.000.000 caracteres o más', assertFails(setDoc(d(u1, 'u1', 'data', 'mov-2026-10'), { j: 'x'.repeat(1000000) })));
await t('«ts» que no es número', assertFails(setDoc(d(u1, 'u1', 'data', 'meta'), { ts: 'mañana' })));
await t('foto con id raro (espacios y símbolos)', assertFails(setDoc(d(u1, 'u1', 'fotos', 'foto mala!'), { d: 'a' })));
await t('foto con id demasiado largo', assertFails(setDoc(d(u1, 'u1', 'fotos', 'x'.repeat(41)), { d: 'a' })));
await t('foto de 1 MB o más', assertFails(setDoc(d(u1, 'u1', 'fotos', 'g3'), { d: 'x'.repeat(1000000) })));
await t('otras rutas: el documento raíz del usuario', assertFails(setDoc(doc(u1, 'users/u1'), { a: 1 })));
await t('otras rutas: colecciones nuevas', assertFails(setDoc(doc(u1, 'otros/x'), { a: 1 })));
await t('otras rutas: subcolecciones nuevas', assertFails(setDoc(doc(u1, 'users/u1/admin/x'), { a: 1 })));

await env.cleanup();
console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
process.exit(res.every(Boolean) ? 0 : 1);
