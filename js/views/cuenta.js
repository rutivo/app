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

// ---------- sección "Mi cuenta" ----------

export function renderAccount() {
  const box = $('#acct');
  if (!box) return;
  if (!accountsEnabled()) {
    box.innerHTML = '';
    box.parentElement.hidden = true;
    return;
  }
  box.parentElement.hidden = false;
  box.innerHTML = currentUser
    ? '<div class="mut">Has entrado como</div><div><b>' + esc(currentUser.email) + '</b></div>' +
      '<div class="mut mt8">Tus datos se guardan en la nube y los recuperas entrando con este email en cualquier móvil.</div>' +
      '<button class="sec" id="alo">Cerrar sesión</button>' +
      '<details class="mt14" id="adel"><summary class="mut">Borrar mi cuenta</summary>' +
      '<div class="mut mt8">Se borran tu cuenta y <b>todos tus datos</b> de la nube y de este móvil. No se puede deshacer. ' +
      'Si quieres conservarlos, guarda antes una copia de seguridad en archivo.</div>' +
      '<label class="f" for="adpw">Escribe tu contraseña para confirmar</label>' +
      '<input id="adpw" type="password" autocomplete="current-password">' +
      '<div id="aderr" class="out mt8" role="alert"></div>' +
      '<button class="sec danger" id="adgo">Borrar mi cuenta y mis datos para siempre</button></details>'
    : '<div class="mut">Sin conexión con tu cuenta. Trabajando con los datos de este móvil.</div>';
  const out = $('#alo');
  if (out) out.onclick = () => signOut(out);
  const del = $('#adgo');
  if (del) del.onclick = () => deleteMyAccount(del);
}

async function deleteMyAccount(button) {
  const password = $('#adpw').value;
  const error = (t) => ($('#aderr').textContent = t);
  if (!password) return error('Escribe tu contraseña.');
  if (!confirmTapTimed(button, 'Toca otra vez para borrar todo', null, 8000)) return;
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
  const text = risky ? 'Hay cambios sin subir (sin conexión). Toca otra vez para salir y perderlos' : 'Toca otra vez para cerrar sesión';
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
  else status('Tus datos se guardan en este dispositivo. Haz copias de seguridad (Facturas) para no perderlos.');
}
