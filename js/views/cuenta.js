// Cuentas de usuario: pantalla de entrada/registro y sección "Mi cuenta".
//
// Modos:
//  - Con FIREBASE_CONFIG: hay que registrarse; los datos se guardan en la nube.
//  - Dentro de Claude: se sincroniza con la cuenta de Claude, sin registro.
//  - Sin nada configurado: solo en el móvil (como versiones anteriores).
import { claudeStore } from '../backend/claude.js';
import { clearSyncConflicts, connect, disconnectAndWipe, flush, hasUnsavedChanges, localOwner, status, stopSync, syncConflicts } from '../cloud.js';
import { FIREBASE_CONFIG } from '../config.js';
import { $, confirmTapTimed, toast } from '../dom.js';
import { disablePush } from '../push.js';

/** Quita los avisos pendientes del servidor (llevan nombres de pasajeros). Sin esperar más de 4 s. */
const dropAlerts = () => Promise.race([disablePush().catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
import { S, hasLocalData } from '../store.js';
import { esc } from '../utils.js';
import { legalLinks, rememberAccepted } from '../legal.js';

/** Contraseña de una cuenta nueva: mínimo 8, con letras y números, y que no sea el email. Devuelve el problema o ''. */
export function passwordProblem(pw, email = '') {
  if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[a-zA-ZñÑ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe tener letras y números.';
  const user = email.split('@')[0].toLowerCase();
  if (user.length >= 4 && pw.toLowerCase().includes(user)) return 'La contraseña no puede contener tu email.';
  if (/^(12345678|password|contraseña|qwerty)/i.test(pw)) return 'Esa contraseña es demasiado fácil. Elige otra.';
  return '';
}

let rerenderAll = () => {};
let fb = null; // módulo backend/firebase.js, cargado solo si hace falta
let currentUser = null;

export const accountsEnabled = () => !!FIREBASE_CONFIG;

// ---------- pantalla de entrada ----------

let wall = null;

function showWall({ offline = false } = {}) {
  if (wall) return;
  const migrating = hasLocalData() && !localOwner();
  wall = document.createElement('div');
  wall.className = 'auth-wall';
  wall.innerHTML =
    '<div><h1>Rutivo</h1>' +
    '<p class="mut">' +
    (migrating
      ? 'Crea tu cuenta para guardar tus datos en la nube. Lo que ya tienes en este móvil se añadirá a tu cuenta.'
      : 'Entra en tu cuenta o créala gratis. Tus datos se guardan en la nube y los recuperas en cualquier móvil.') +
    '</p>' +
    (offline ? '<div class="card out">Sin conexión. Necesitas internet para entrar la primera vez.</div>' : '') +
    '<div class="card"><form id="authf" novalidate>' +
    '<div class="seg">' +
    '<input type="radio" name="am" id="am1" value="login"' + (migrating ? '' : ' checked') + '><label for="am1">Entrar</label>' +
    '<input type="radio" name="am" id="am2" value="register"' + (migrating ? ' checked' : '') + '><label for="am2">Crear cuenta</label>' +
    '</div>' +
    '<label class="f" for="aem">Email</label><input id="aem" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required>' +
    '<label class="f" for="apw">Contraseña</label><input id="apw" type="password" autocomplete="current-password" minlength="6" required>' +
    '<div id="apw2box"><div class="mut">Mínimo 8 caracteres, con letras y números.</div><label class="f" for="apw2">Repite la contraseña</label><input id="apw2" type="password" autocomplete="new-password" minlength="6">' +
    '<label class="chk mt10"><input type="checkbox" id="alegal"><span>He leído y acepto las ' + legalLinks + '.</span></label></div>' +
    '<div id="aerr" class="out mt8" role="alert"></div>' +
    '<button id="ago">Entrar</button>' +
    '<button type="button" class="sec" id="arst">He olvidado mi contraseña</button>' +
    '</form></div></div>';
  document.body.appendChild(wall);

  const form = wall.querySelector('#authf');
  const mode = () => form.querySelector('input[name=am]:checked').value;
  const error = (t) => (wall.querySelector('#aerr').textContent = t);
  const syncMode = () => {
    const reg = mode() === 'register';
    wall.querySelector('#apw2box').style.display = reg ? 'block' : 'none';
    wall.querySelector('#ago').textContent = reg ? 'Crear cuenta' : 'Entrar';
    wall.querySelector('#apw').autocomplete = reg ? 'new-password' : 'current-password';
    wall.querySelector('#arst').style.display = reg ? 'none' : 'block';
    error('');
  };
  form.querySelectorAll('input[name=am]').forEach((r) => (r.onchange = syncMode));
  syncMode();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = wall.querySelector('#aem').value.trim();
    const pw = wall.querySelector('#apw').value;
    if (!email) return error('Escribe tu email.');
    if (pw.length < 6) return error('La contraseña debe tener al menos 6 caracteres.');
    if (mode() === 'register') {
      const weak = passwordProblem(pw, email);
      if (weak) return error(weak);
      if (pw !== wall.querySelector('#apw2').value) return error('Las contraseñas no coinciden.');
      if (!wall.querySelector('#alegal').checked) return error('Para crear la cuenta, acepta las condiciones de uso y la política de privacidad.');
    }
    const button = wall.querySelector('#ago');
    button.disabled = true;
    error('');
    try {
      await ensureFirebase();
      if (mode() === 'register') {
        rememberAccepted();
        await fb.register(email, pw);
      }
      else await fb.login(email, pw);
      // watchSession se encarga del resto al detectar la sesión.
    } catch (err) {
      error(fb ? fb.authErrorMessage(err) : 'Sin conexión. Revisa internet e inténtalo otra vez.');
    }
    button.disabled = false;
  };

  wall.querySelector('#arst').onclick = async () => {
    const email = wall.querySelector('#aem').value.trim();
    if (!email) return error('Escribe tu email arriba y vuelve a tocar aquí.');
    try {
      await ensureFirebase();
      await fb.resetPassword(email);
      error('');
      toast('Te hemos enviado un email para cambiar la contraseña. Mira también en spam.');
    } catch (err) {
      error(fb ? fb.authErrorMessage(err) : 'Sin conexión. Revisa internet e inténtalo otra vez.');
    }
  };
}

function hideWall() {
  if (wall) wall.remove();
  wall = null;
}

// ---------- pantalla "Cuenta" ----------

const PERSON_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 20.5c.9-4.2 4.3-6.5 8.5-6.5s7.6 2.3 8.5 6.5z"/></svg>';

const initial = (email) => esc((email || '?').trim().charAt(0).toUpperCase());

/** Fila de lista estilo ajustes. */
const row = (id, icon, title, subtitle, extraClass = '') =>
  '<button class="row-btn ' + extraClass + '" id="' + id + '" type="button">' +
  '<span class="ico" aria-hidden="true">' + icon + '</span>' +
  '<span class="txt"><b data-label>' + title + '</b><small>' + subtitle + '</small></span>' +
  '<span class="chev" aria-hidden="true">›</span></button>';

function renderAvatarButton() {
  const btn = $('#acctbtn');
  if (!btn) return;
  btn.innerHTML = currentUser ? initial(currentUser.email) : PERSON_ICON;
}

function profileCard() {
  if (!accountsEnabled()) {
    return (
      '<div class="card profile"><div class="avatar">' + PERSON_ICON + '</div><div>' +
      '<b>Este dispositivo</b><small>Tus datos se guardan solo en este móvil. Haz copias de seguridad.</small></div></div>'
    );
  }
  if (!currentUser) {
    return (
      '<div class="card profile"><div class="avatar">' + PERSON_ICON + '</div><div>' +
      '<b>Sin conexión</b><small>Trabajando con los datos de este móvil. Se sincronizarán al volver internet.</small></div></div>'
    );
  }
  return (
    '<div class="card profile"><div class="avatar">' + initial(currentUser.email) + '</div><div>' +
    '<b>' + esc(currentUser.email) + '</b><small class="ok">● Sincronizado en la nube</small></div></div>' +
    (currentUser.emailVerified === false
      ? '<div class="card warn-card" id="verif"><b>📧 Confirma tu email</b><div class="mut mt8">Te enviamos un enlace a ' + esc(currentUser.email) +
        '. Confirmarlo protege tu cuenta (por ejemplo, para recuperar la contraseña). Mira también en spam.</div>' +
        '<div class="row mt8"><button type="button" class="sec" id="verre">Reenviar email</button><button type="button" id="verok">Ya lo he confirmado</button></div>' +
        '<div id="vermsg" class="mut mt8" role="status"></div></div>'
      : '') +
    '<h3 class="sect">Sesión</h3>' +
    '<div class="card list">' +
    row('alo', '⎋', 'Cerrar sesión', 'Tus datos seguirán guardados en tu cuenta') +
    '</div>' +
    '<h3 class="sect">Privacidad</h3>' +
    '<div class="card list"><details class="row-more" id="adel">' +
    '<summary class="row-btn danger"><span class="ico" aria-hidden="true">✕</span>' +
    '<span class="txt"><b>Eliminar cuenta</b><small>Borra tu cuenta y todos tus datos</small></span>' +
    '<span class="chev" aria-hidden="true">›</span></summary>' +
    '<div class="row-body"><div class="mut">Se eliminarán tu cuenta y todos tus datos, en la nube y en este móvil. ' +
    'Esta acción no se puede deshacer. Si quieres conservarlos, exporta antes una copia.</div>' +
    '<label class="f" for="adpw">Contraseña</label><input id="adpw" type="password" autocomplete="current-password">' +
    '<div id="aderr" class="out mt8" role="alert"></div>' +
    '<button class="sec danger" id="adgo" type="button">Eliminar cuenta definitivamente</button></div></details></div>'
  );
}

const AREA = { mov: 'Caja', srv: 'Servicio', fac: 'Factura', gas: 'Gasolina', huc: 'Hucha', prv: 'Proveedor', jor: 'Jornada', cfg: 'Ajustes', cli: 'Cliente' };
const FIELD = { i: 'importe', c: 'concepto', p: 'pago', f: 'fecha', h: 'hora', t: 'tipo', o: 'origen', d: 'destino', pa: 'pasajero', vu: 'vuelo', cl: 'cliente', num: 'número' };
const short = (v) => {
  if (v == null) return '(borrado)';
  const s = typeof v === 'object' ? (v.c || v.num || v.nom || v.cl || JSON.stringify(v)) : String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
};

/** Cosas cambiadas a la vez en dos móviles (se quedó lo de este móvil; aquí se ve lo otro). */
function conflictsCard() {
  const list = syncConflicts();
  if (!list.length) return '';
  const row = (c) => {
    const what = (AREA[c.list || c.area] || c.list || c.area) + (c.field ? ' · ' + (FIELD[c.field] || c.field) : '');
    const when = new Date(c.at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const txt = c.kind === 'deleted-here-changed-there' ? 'Lo borraste aquí, pero en otro móvil lo cambiaron: se ha conservado (' + short(c.remote) + ').'
      : c.kind === 'deleted-there-changed-here' ? 'Lo borraron en otro móvil, pero aquí lo cambiaste: se ha conservado (' + short(c.local) + ').'
        : 'Aquí: ' + short(c.local) + ' · En el otro móvil: ' + short(c.remote) + '. Se ha quedado el de aquí.';
    return '<div class="it"><div><b>' + esc(what) + '</b><small>' + esc(when) + ' · ' + esc(txt) + '</small></div></div>';
  };
  return '<h3 class="sect">Sincronización</h3><div class="card warn-card"><div class="mut">Cambios hechos a la vez en dos móviles. No se ha perdido nada: aquí tienes el otro valor por si quieres corregirlo.</div>' +
    '<div class="list mt8">' + list.slice(0, 20).map(row).join('') + '</div>' +
    '<button type="button" class="sec mt8" id="syncok">Entendido, borrar estos avisos</button></div>';
}

export function renderAccount() {
  renderAvatarButton();
  const box = $('#acct');
  // No repintar mientras se escribe (p. ej. la contraseña para eliminar la cuenta).
  if (!box || box.contains(document.activeElement)) return;
  const wasOpen = $('#adel') && $('#adel').open;
  box.innerHTML = profileCard() + conflictsCard();
  const sok = $('#syncok');
  if (sok) sok.onclick = () => { sok.blur(); clearSyncConflicts(); renderAccount(); };
  const lg = $('#legalok');
  if (lg) lg.textContent = S.cfg.legal && S.cfg.legal.at && S.cfg.legal.at !== 'x' ? 'Aceptadas el ' + String(S.cfg.legal.at).slice(0, 10).split('-').reverse().join('/') : 'Léelas aquí';
  if (wasOpen && $('#adel')) $('#adel').open = true;
  const vre = $('#verre');
  if (vre) vre.onclick = async () => {
    vre.disabled = true;
    try { await fb.resendVerification(); $('#vermsg').textContent = 'Enviado ✓. Revisa tu correo (y spam).'; } catch (e) { $('#vermsg').textContent = fb.authErrorMessage(e); }
    setTimeout(() => { vre.disabled = false; }, 30000);
  };
  const vok = $('#verok');
  if (vok) vok.onclick = async () => {
    try {
      if (await fb.refreshVerified()) { vok.blur(); currentUser = { ...currentUser, emailVerified: true }; renderAccount(); toast('Email confirmado ✓'); }
      else $('#vermsg').textContent = 'Aún no consta como confirmado. Abre el enlace del email y vuelve a tocar.';
    } catch { $('#vermsg').textContent = 'Sin conexión. Inténtalo en un momento.'; }
  };
  const out = $('#alo');
  if (out) out.onclick = () => signOut(out);
  const del = $('#adgo');
  if (del) del.onclick = () => deleteMyAccount(del);
}

async function deleteMyAccount(button) {
  const password = $('#adpw').value;
  const error = (t) => ($('#aderr').textContent = t);
  if (!password) return error('Escribe tu contraseña.');
  if (!confirmTapTimed(button, 'Toca otra vez para confirmar', null, 8000)) return;
  button.disabled = true;
  error('');
  try {
    await fb.deleteAccount(password, stopSync);
  } catch (err) {
    button.disabled = false;
    error(fb.authErrorMessage(err));
    return;
  }
  await dropAlerts(); // los avisos con la app cerrada también se borran del servidor
  disconnectAndWipe();
  toast('Cuenta borrada.');
  setTimeout(() => location.reload(), 1200);
}

async function signOut(button) {
  // Antes de salir, subir lo pendiente: al salir se borran los datos del móvil.
  const saved = await flush();
  const risky = !saved || hasUnsavedChanges();
  const text = risky ? 'Cambios sin subir. Toca otra vez para salir igualmente' : 'Toca otra vez para cerrar sesión';
  if (!confirmTapTimed(button, text, risky ? null : 'Al salir se borran los datos de este móvil; seguirán en tu cuenta.')) return;
  try {
    await fb.logout();
  } catch {
    toast('No se pudo cerrar sesión. Revisa la conexión.');
    return;
  }
  await dropAlerts(); // al salir se borran los datos del móvil: también sus avisos pendientes
  disconnectAndWipe();
  location.reload();
}

// ---------- arranque ----------

async function ensureFirebase() {
  if (!fb) fb = await import('../backend/firebase.js');
  return fb;
}

async function startFirebase() {
  status('Conectando con tu cuenta…');
  try {
    await ensureFirebase();
    await fb.watchSession((user) => {
      if (user) {
        hideWall();
        const changed = !currentUser || currentUser.uid !== user.uid;
        currentUser = user;
        renderAccount();
        if (changed) connect(fb.userStore(user.uid), user.uid, rerenderAll);
      } else {
        currentUser = null;
        renderAccount();
        showWall();
      }
    });
  } catch {
    // No se pudo cargar Firebase (sin conexión). Si este móvil ya tenía una
    // cuenta, se sigue trabajando en local; si no, hace falta conexión.
    renderAccount();
    if (localOwner()) status('Sin conexión: trabajando con los datos de este móvil.');
    else showWall({ offline: true });
  }
}

async function startClaude() {
  try {
    const store = await claudeStore();
    if (!store) {
      status('Sin cuenta de Claude activa: los datos están solo en este móvil.');
      return;
    }
    await connect(store, store.uid, rerenderAll);
  } catch {
    status('Sin conexión con tu cuenta: los datos están solo en este móvil.');
  }
}

export function initAccount(rerender) {
  rerenderAll = rerender;
  window.addEventListener('rutivo:sync', () => renderAccount());
  renderAccount();
  if (accountsEnabled()) startFirebase();
  else if (window.claude) startClaude();
  else status('Tus datos se guardan en este dispositivo. Haz copias de seguridad desde Cuenta (arriba a la derecha) para no perderlos.');
}
