// Firebase simulado para pruebas en navegador (Playwright), sin tocar el proyecto real.
// - Firestore en memoria, compartido por todas las páginas (varios «móviles»).
// - Aplica lo mismo que el real y que firestore.rules: cada usuario solo lo suyo,
//   nombres de documento permitidos, campos j/ts, texto < 1.000.000 caracteres y
//   documento ≤ 1 MiB.
// - Permite simular sin conexión y rechazos de documentos concretos.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const API = 'https://firestore.googleapis.com/__falso/';

const APP_JS = 'export const initializeApp = (c) => ({ c });';
const AUTH_JS = `
const U = () => ({ uid: self.__uid || 'u1', email: (self.__uid || 'u1') + '@prueba.test' });
const A = { get currentUser() { return U(); }, languageCode: '' };
export const getAuth = () => A;
export const onAuthStateChanged = (a, f) => setTimeout(() => f(U()));
export const createUserWithEmailAndPassword = async () => ({ user: U() });
export const signInWithEmailAndPassword = async () => ({ user: U() });
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => {};
export const reauthenticateWithCredential = async () => {};
export const deleteUser = async () => {};
export const EmailAuthProvider = { credential: () => ({}) };`;
const FS_JS = `
const H = '${API}';
export const getFirestore = () => ({});
export const collection = (db, ...p) => ({ path: p.join('/') });
export const doc = (base, ...p) => { const path = base && base.path ? base.path + '/' + p.join('/') : p.join('/'); return { path, id: path.split('/').pop() }; };
async function call(op, p, body) {
  const r = await fetch(H + op + '?p=' + encodeURIComponent(p), { method: 'POST', headers: { 'content-type': 'application/json', 'x-uid': self.__uid || 'u1' }, body: JSON.stringify(body || null) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
  return j;
}
export async function getDocs(col) { const j = await call('list', col.path); return { docs: j.docs.map((d) => ({ id: d.id, ref: { path: col.path + '/' + d.id }, data: () => d.data })) }; }
export const setDoc = (ref, data) => call('set', ref.path, data);
export const deleteDoc = (ref) => call('del', ref.path);
export async function getDoc(ref) { const j = await call('get', ref.path); return { exists: () => j.data != null, data: () => j.data }; }
// Transacción: lo leído se comprueba en el servidor al confirmar (como Firestore)
export async function runTransaction(db, fn) {
  const reads = [];
  const ops = [];
  const tx = {
    async get(ref) { const j = await call('get', ref.path); reads.push({ path: ref.path, data: j.data }); return { exists: () => j.data != null, data: () => j.data }; },
    set(ref, data) { ops.push({ op: 'set', path: ref.path, data }); },
    delete(ref) { ops.push({ op: 'del', path: ref.path }); },
  };
  const out = await fn(tx);
  if (ops.length) await call('commit', ops[0].path, { reads, ops });
  return out;
}`;

/** Las mismas comprobaciones que firestore.rules (y el límite de tamaño de Firestore). */
function check(uid, op, p, body) {
  const m = p.match(/^users\/([^/]+)\/(data|fotos)(?:\/([^/]+))?$/);
  if (!m || m[1] !== uid) return { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
  if (op !== 'set') return null;
  const [, , coll, id] = m;
  const keys = Object.keys(body || {});
  if (coll === 'data') {
    if (!/^(meta|cfg|(mov|srv|gas|huc|jor|prv|fac)-[0-9a-z-]{3,7})$/.test(id)) return { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    if (!keys.every((k) => k === 'j' || k === 'ts')) return { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    if ('j' in body && !(typeof body.j === 'string' && body.j.length < 1000000)) return { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    if ('ts' in body && typeof body.ts !== 'number') return { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
  }
  if (Buffer.byteLength(JSON.stringify(body)) > 1048576) return { code: 'invalid-argument', message: 'Document exceeds maximum size (1,048,576 bytes).' };
  return null;
}

function createFirestore() {
  const db = new Map(); // ruta completa → datos
  const state = { offline: false, reject: new Map(), writes: [], ops: {} };
  return {
    db, state,
    docsOf: (uid) => Object.fromEntries([...db].filter(([k]) => k.startsWith('users/' + uid + '/data/')).map(([k, v]) => [k.split('/').pop(), v])),
    async route(r) {
      const u = new URL(r.request().url());
      if (state.offline) return r.abort('internetdisconnected');
      const op = u.pathname.split('/').pop();
      state.ops[op] = (state.ops[op] || 0) + 1;
      const p = u.searchParams.get('p');
      const uid = r.request().headers()['x-uid'];
      const body = JSON.parse(r.request().postData() || 'null');
      const reply = (o) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      const forced = state.reject.get(p.split('/').pop());
      if (forced && op === 'set') return reply({ error: forced });
      const err = check(uid, op, p, body);
      if (err) return reply({ error: err });
      if (op === 'list') return reply({ docs: [...db].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), data: v })) });
      if (op === 'get') return reply({ data: db.has(p) ? db.get(p) : null });
      if (op === 'set') { db.set(p, body); state.writes.push(p); return reply({ ok: true }); }
      if (op === 'commit') {
        // Si algo de lo leído ha cambiado desde entonces, se rechaza (como Firestore: «aborted»)
        if (state.beforeCommit) await state.beforeCommit(body);
        for (const rd of body.reads) if (JSON.stringify(db.has(rd.path) ? db.get(rd.path) : null) !== JSON.stringify(rd.data)) return reply({ error: { code: 'aborted', message: 'Transaction conflict.' } });
        for (const o of body.ops) {
          const e = check(uid, o.op === 'set' ? 'set' : 'del', o.path, o.data);
          if (e) return reply({ error: e });
        }
        // Si el lote incluye un documento rechazado, se rechaza todo el lote (como Firestore)
        const hit = body.ops.find((o) => state.reject.has(o.path.split('/').pop()));
        if (hit) return reply({ error: state.reject.get(hit.path.split('/').pop()) });
        for (const o of body.ops) { if (o.op === 'set') { db.set(o.path, o.data); state.writes.push(o.path); } else db.delete(o.path); }
        return reply({ ok: true });
      }
      if (op === 'del') { db.delete(p); return reply({ ok: true }); }
      return reply({ error: { code: 'unknown', message: op } });
    },
  };
}

/** Servidor de la app (archivos del repositorio) en un puerto libre. */
function serveApp() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/' })));
}

/**
 * Un «móvil»: contexto de navegador con su propio almacenamiento, conectado al
 * Firestore simulado como el usuario `uid`. `local`: datos que ya tenía el móvil.
 */
async function device(browser, app, store, { uid = 'u1', local = null, owner = true, name = '' } = {}) {
  const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 400, height: 860 } });
  let off = false; // sin conexión SOLO este móvil
  const log = [];
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/js/config.js')) {
      return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG={apiKey:'prueba',projectId:'prueba',authDomain:'prueba.test',appId:'1'};export const TRIAL_ENABLED=false;export const FIREBASE_SDK='" + SDK.slice(0, -1) + "';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';" });
    }
    if (r.request().url().startsWith(SDK)) {
      const name = u.pathname.split('/').pop();
      const body = name === 'firebase-app.js' ? APP_JS : name === 'firebase-auth.js' ? AUTH_JS : FS_JS;
      return r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
    }
    if (r.request().url().startsWith(API)) {
      if (off) return r.abort('internetdisconnected');
      log.push(u.pathname.split('/').pop() + ' ' + decodeURIComponent(u.searchParams.get('p') || '').split('/').pop());
      return store.route(r);
    }
    if (u.hostname === '127.0.0.1') return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(([uid, local, owner]) => {
    self.__uid = uid;
    if (sessionStorage.getItem('__iniciado')) return; // solo la primera carga
    sessionStorage.setItem('__iniciado', '1');
    for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0']]) localStorage.setItem(k, v);
    if (local) localStorage.setItem('cajaTransfer', JSON.stringify(local));
    if (owner) localStorage.setItem('cajaOwner', uid);
  }, [uid, local, owner]);
  await page.goto(app.url);
  /** Corta o devuelve la conexión de este móvil (como el modo avión). */
  const setOffline = async (v) => {
    off = v;
    await page.evaluate((v) => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !v }); window.dispatchEvent(new Event(v ? 'offline' : 'online')); }, v);
  };
  return { ctx, page, setOffline, log, name };
}

module.exports = { createFirestore, serveApp, device };
