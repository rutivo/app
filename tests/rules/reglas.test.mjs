// Pruebas de las reglas REALES de Firestore (firestore.rules) con el emulador oficial.
// No toca el proyecto real (proyecto «demo-»). Uso (desde la raíz):
//   npx firebase emulators:exec --config tests/rules/firebase.json --project demo-rutivo "node tests/rules/reglas.test.mjs"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
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

// ---- Enlaces para el cliente (enlaces/{código}) y la marca del dueño (users/{uid}/enlaces/{código}) ----
const ID = 'AbCdEfGhIjKlMnOpQrSt';
const ID2 = 'ZyXwVuTsRqPoNmLkJiHg';
const OLD = 'OldOldOldOldOldOldOl';
const soon = () => Timestamp.fromMillis(Date.now() + 2 * 864e5);
const link = (extra = {}) => ({ d: '{"v":1,"n":"John"}', exp: soon(), ...extra });
/** Como la app: la marca «es mío» y el enlace, a la vez. */
const put = (db, uid, id, data) => { const b = writeBatch(db); b.set(doc(db, 'users', uid, 'enlaces', id), {}); b.set(doc(db, 'enlaces', id), data); return b.commit(); };
await t('enlace: el conductor crea el suyo (con foto de buena calidad)', assertSucceeds(put(u1, 'u1', ID, link({ ph: '/9j/' + 'A'.repeat(199990) }))));
await t('enlace: lo actualiza (p. ej. el estado «ya estoy»)', assertSucceeds(put(u1, 'u1', ID, link({ st: 'aqui' }))));
await t('enlace: el cliente lo abre SIN cuenta con el código', assertSucceeds(getDoc(doc(anon, 'enlaces', ID))));
const seen = (await getDoc(doc(anon, 'enlaces', ID))).data(); // lo que ve el cliente
await t('enlace: NO dice de quién es (sin el uid del conductor)', Promise.resolve().then(() => { if ('o' in seen || JSON.stringify(seen).includes('u1')) throw new Error(JSON.stringify(Object.keys(seen))); }));
await t('enlace: NO se pueden listar (ni sin cuenta ni con cuenta)', assertFails(getDocs(collection(anon, 'enlaces'))));
await t('enlace: NO se pueden listar con cuenta', assertFails(getDocs(collection(u2, 'enlaces'))));
await t('enlace: la marca de dueño solo la ve su dueño', assertFails(getDoc(doc(u2, 'users', 'u1', 'enlaces', ID))));
await t('enlace: el dueño ve sus marcas (para borrarlas con la cuenta)', assertSucceeds(getDocs(collection(u1, 'users/u1/enlaces'))));
await t('enlace: otro conductor NO lo cambia', assertFails(setDoc(doc(u2, 'enlaces', ID), link())));
await t('enlace: otro conductor NO se adueña de él (marca + cambio)', assertFails(put(u2, 'u2', ID, link({ d: '{"v":1,"n":"Hack"}' }))));
await t('enlace: otro conductor NO crea la marca de un enlace ajeno', assertFails(setDoc(doc(u2, 'users', 'u2', 'enlaces', ID), {})));
await t('enlace: otro conductor NO lo borra', assertFails(deleteDoc(doc(u2, 'enlaces', ID))));
await t('enlace: sin la marca de dueño NO se crea', assertFails(setDoc(doc(u1, 'enlaces', ID2), link())));
await t('enlace: sin cuenta NO se crea', assertFails(setDoc(doc(anon, 'enlaces', ID2), link())));
await t('enlace: con el uid dentro (formato antiguo), ya no', assertFails(put(u1, 'u1', ID2, link({ o: 'u1' }))));
await t('enlace: código corto o con símbolos, no', assertFails(put(u1, 'u1', 'corto', link())));
await t('enlace: la marca con datos, no', assertFails(setDoc(doc(u1, 'users', 'u1', 'enlaces', ID2), { x: 1 })));
await t('enlace: campos extra, no', assertFails(put(u1, 'u1', ID2, link({ precio: 95 }))));
await t('enlace: datos demasiado grandes, no', assertFails(put(u1, 'u1', ID2, link({ d: 'x'.repeat(4000) }))));
await t('enlace: foto demasiado grande, no', assertFails(put(u1, 'u1', ID2, link({ ph: 'x'.repeat(200001) }))));
await t('enlace: caducidad de más de 45 días, no', assertFails(put(u1, 'u1', ID2, link({ exp: Timestamp.fromMillis(Date.now() + 50 * 864e5) }))));
await t('enlace: caducidad que no es fecha, no', assertFails(put(u1, 'u1', ID2, link({ exp: 123 }))));
// Enlaces antiguos (con «o»): su dueño los pasa al formato nuevo o los borra; otro, no
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'enlaces', OLD), { ...link(), o: 'u1' }); });
await t('enlace antiguo: otro conductor NO se adueña', assertFails(put(u2, 'u2', OLD, link())));
await t('enlace antiguo: su dueño lo pasa al formato nuevo (sin su uid)', assertSucceeds(put(u1, 'u1', OLD, link())));
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'enlaces', ID2), { ...link(), o: 'u1' }); });
await t('enlace antiguo: su dueño lo borra', assertSucceeds(deleteDoc(doc(u1, 'enlaces', ID2))));
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'enlaces', ID2), link({ exp: Timestamp.fromMillis(Date.now() - 6e4) })); });
await t('enlace: caducado, el cliente ya NO lo puede abrir', assertFails(getDoc(doc(anon, 'enlaces', ID2))));
await t('enlace: el conductor borra el suyo', assertSucceeds(deleteDoc(doc(u1, 'enlaces', ID))));
await t('enlace: y su marca', assertSucceeds(deleteDoc(doc(u1, 'users', 'u1', 'enlaces', ID))));
await t('enlace: borrado, ya no se abre', assertFails(getDoc(doc(anon, 'enlaces', ID))));

await env.cleanup();
console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
process.exit(res.every(Boolean) ? 0 : 1);
