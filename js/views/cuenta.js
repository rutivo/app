// Cuentas de usuario: pantalla de entrada/registro y sección "Mi cuenta".
//
// Modos:
//  - Con FIREBASE_CONFIG: hay que registrarse; los datos se guardan en la nube.
//  - Dentro de Claude: se sincroniza con la cuenta de Claude, sin registro.
//  - Sin nada configurado: solo en el móvil (como versiones anteriores).
import { claudeStore } from '../backend/claude.js';
import { connect, disconnectAndWipe, flush, hasUnsavedChanges, localOwner, status, stopSync } from '../cloud.js';
import { FIREBASE_CONFIG } from '../config.js';
import { $, confirmTapTimed, toast } from '../dom.js';
import { hasLocalData } from '../store.js';
import { esc } from '../utils.js';

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
    '<div id="apw2box"><label class="f" for="apw2">Repite la contraseña</label><input id="apw2" type="password" autocomplete="new-password" minlength="6"></div>' +
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
    if (mode() === 'register' && pw !== wall.querySelector('#apw2').value) return error('Las contraseñas no coinciden.');
    const button = wall.querySelector('#ago');
    button.disabled = true;
    error('');
    try {
      await ensureFirebase();
      if (mode() === 'register') await fb.register(email, pw);
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

export function renderAccount() {
  renderAvatarButton();
  const box = $('#acct');
  // No repintar mientras se escribe (p. ej. la contraseña para eliminar la cuenta).
  if (!box || box.contains(document.activeElement)) return;
  const wasOpen = $('#adel') && $('#adel').open;
  box.innerHTML = profileCard();
  if (wasOpen && $('#adel')) $('#adel').open = true;
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
  renderAccount();
  if (accountsEnabled()) startFirebase();
  else if (window.claude) startClaude();
  else status('Tus datos se guardan en este dispositivo. Haz copias de seguridad desde Cuenta (arriba a la derecha) para no perderlos.');
}
