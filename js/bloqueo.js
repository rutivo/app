// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Bloqueo de la app con PIN (y Face ID / huella si el móvil lo permite).
//
// Protege los datos si alguien coge tu móvil desbloqueado: al abrir Rutivo, o
// al volver tras un rato fuera, hay que poner el PIN. Mientras está bloqueada no
// se ve nada y «Oye Rutivo» no escucha.
// - El PIN no se guarda: solo una huella (PBKDF2-SHA-256, 150.000 vueltas, sal
//   aleatoria). Con ella no se puede saber el PIN.
// - Intentos fallidos: a partir del 5.º hay que esperar, cada vez más.
// - Face ID / huella: WebAuthn con el autenticador del propio móvil (verificación
//   del usuario obligatoria). Es un cierre local: no cifra los datos guardados.
// - ¿PIN olvidado? Cerrar sesión (los datos siguen en tu cuenta) y volver a entrar.
const KEY = 'bloqueo';
const FAILS = 'bloqueoFallos';
const ITER = 150000;
export const MINUTES = [0, 1, 5, 15];

// ---------- cálculos (puros, probados aparte) ----------
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Huella del PIN (base64). */
export async function pinHash(pin, salt, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: iter }, key, 256);
  return b64(bits);
}
export const validPin = (pin) => /^\d{4,6}$/.test(String(pin));
/** Espera tras `n` fallos seguidos: 0 hasta 4; luego 30 s, 1 min, 2 min… (máx. 15 min). */
export const waitAfter = (n) => (n < 5 ? 0 : Math.min(15 * 60e3, 30e3 * 2 ** (n - 5)));
/** Comparación sin atajos (mismo tiempo acierte o no). */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- ajustes guardados ----------
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
export const lockSettings = () => read(KEY);
export const lockEnabled = () => { const s = read(KEY); return !!(s && s.hash && s.salt); };

export async function enableLock(pin, mins = 1) {
  if (!validPin(pin)) throw new Error('pin');
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const prev = read(KEY) || {};
  write(KEY, { salt, iter: ITER, hash: await pinHash(pin, salt), len: String(pin).length, mins: MINUTES.includes(+mins) ? +mins : 1, bio: prev.bio || null });
  write(FAILS, null);
}
export function disableLock() { write(KEY, null); write(FAILS, null); }
export function setLockMinutes(mins) { const s = read(KEY); if (s) { s.mins = MINUTES.includes(+mins) ? +mins : 1; write(KEY, s); } }

/** Comprueba el PIN. {ok} o {ok:false, wait} (ms que hay que esperar) o {ok:false, left} (intentos antes de esperar). */
export async function checkPin(pin) {
  const s = read(KEY);
  if (!s) return { ok: true };
  const f = read(FAILS) || { n: 0, until: 0 };
  if (f.until > Date.now()) return { ok: false, wait: f.until - Date.now() };
  const good = validPin(pin) && same(await pinHash(pin, s.salt, s.iter || ITER), s.hash);
  if (good) { write(FAILS, null); return { ok: true }; }
  f.n++;
  f.until = Date.now() + waitAfter(f.n);
  write(FAILS, f);
  return { ok: false, wait: waitAfter(f.n), left: Math.max(0, 5 - f.n) };
}

// ---------- Face ID / huella (WebAuthn, autenticador del móvil) ----------
export async function bioAvailable() {
  try {
    return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function enableBio() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: challenge(), rp: { name: 'Rutivo', id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'rutivo', displayName: 'Rutivo' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none',
  } });
  if (!cred) throw new Error('bio');
  const s = read(KEY);
  if (s) { s.bio = b64(cred.rawId); write(KEY, s); }
}
export function disableBio() { const s = read(KEY); if (s) { s.bio = null; write(KEY, s); } }

async function bioUnlock() {
  const s = read(KEY);
  if (!s || !s.bio) return false;
  try {
    const a = await navigator.credentials.get({ publicKey: { challenge: challenge(), allowCredentials: [{ type: 'public-key', id: unb64(s.bio) }], userVerification: 'required', timeout: 60000 } });
    return !!a && !!(a.response && a.response.authenticatorData) && (new Uint8Array(a.response.authenticatorData)[32] & 0x04) === 0x04; // UV: el usuario se identificó
  } catch {
    return false;
  }
}

// ---------- pantalla de bloqueo ----------
let overlay = null;
let hooks = { onLock: () => {}, onUnlock: () => {}, onForgot: null };
let hiddenAt = 0;
export const isLocked = () => !!overlay;

function ensureStyle() {
  if (document.getElementById('lockcss')) return;
  const st = document.createElement('style');
  st.id = 'lockcss';
  st.textContent = 'body.locked>*:not(#lock):not(#lockcss){visibility:hidden!important}';
  document.head.appendChild(st);
}

/** Bloquea ya (si hay PIN). */
export function lockNow() {
  if (!lockEnabled() || overlay) return;
  ensureStyle();
  document.body.classList.add('locked');
  const s = lockSettings();
  overlay = document.createElement('div');
  overlay.id = 'lock';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Rutivo bloqueado');
  overlay.innerHTML =
    '<div class="lk-top"><div class="lk-ico" aria-hidden="true">🔒</div><b>Rutivo bloqueado</b><span class="mut">Escribe tu PIN</span></div>' +
    '<div class="lk-dots" aria-live="polite"></div><div class="lk-msg out" role="alert"></div>' +
    '<div class="lk-pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((k) =>
      k === 'bio' ? (s && s.bio ? '<button type="button" data-lk="bio" aria-label="Desbloquear con Face ID o huella">👤</button>' : '<span></span>')
        : k === 'del' ? '<button type="button" data-lk="del" aria-label="Borrar">⌫</button>'
          : '<button type="button" data-lk="' + k + '">' + k + '</button>').join('') + '</div>' +
    '<button type="button" class="lk-forgot" data-lk="forgot">¿Has olvidado el PIN?</button>';
  document.body.appendChild(overlay);
  let pin = '';
  let busy = false;
  const dots = overlay.querySelector('.lk-dots');
  const msg = overlay.querySelector('.lk-msg');
  // Tantos huecos como cifras tiene TU PIN (4, 5 o 6); en PIN antiguos sin ese dato, 6 huecos que se pueden dejar a medias
  const size = (lockSettings() || {}).len || 0;
  const paint = () => { dots.innerHTML = Array.from({ length: size || Math.max(4, pin.length) }, (_, i) => '<i class="' + (i < pin.length ? 'on' : '') + '"></i>').join(''); };
  paint();
  const tryPin = async () => {
    if (busy) return;
    busy = true;
    const r = await checkPin(pin);
    busy = false;
    if (r.ok) return unlock();
    pin = '';
    paint();
    overlay.classList.remove('shake'); void overlay.offsetWidth; overlay.classList.add('shake');
    msg.textContent = r.wait ? 'Demasiados intentos. Espera ' + Math.ceil(r.wait / 1000) + ' s.' : 'PIN incorrecto' + (r.left ? ' · te quedan ' + r.left + ' intentos' : '');
  };
  overlay.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lk]');
    if (!b) return;
    const k = b.dataset.lk;
    if (k === 'del') { pin = pin.slice(0, -1); paint(); return; }
    if (k === 'bio') { if (await bioUnlock()) unlock(); else msg.textContent = 'No se pudo comprobar. Usa el PIN.'; return; }
    if (k === 'forgot') { forgot(); return; }
    if (pin.length >= 6) return;
    pin += k;
    msg.textContent = '';
    paint();
    // 4 cifras: se comprueba; si el PIN es más largo, al fallar se puede seguir escribiendo
    if (pin.length === ((lockSettings() || {}).len || 4)) tryPin();
  });
  // Teclado físico (ordenador)
  overlay.tabIndex = -1;
  overlay.focus();
  overlay.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) overlay.querySelector('[data-lk="' + e.key + '"]').click();
    else if (e.key === 'Backspace') overlay.querySelector('[data-lk="del"]').click();
    else if (e.key === 'Enter' && pin.length >= 4) tryPin();
  });
  hooks.onLock();
  if (s && s.bio) setTimeout(async () => { if (overlay && (await bioUnlock())) unlock(); }, 400);
}

function forgot() {
  const msg = overlay.querySelector('.lk-msg');
  msg.innerHTML = '<span class="mut">Cierra sesión y vuelve a entrar con tu email y contraseña: tus datos siguen en tu cuenta y el bloqueo se quita.</span><button type="button" class="sec mt8" data-lkout>Cerrar sesión</button>';
  msg.querySelector('[data-lkout]').onclick = async (e) => {
    if (typeof hooks.onForgot !== 'function') return;
    e.target.disabled = true;
    e.target.textContent = 'Guardando en tu cuenta…';
    const r = await hooks.onForgot(disableLock); // antes de salir sube lo pendiente; si no puede, no sale
    if (r !== 'ok') {
      e.target.disabled = false;
      e.target.textContent = 'Cerrar sesión';
      msg.querySelector('.mut').textContent = r === 'pendiente'
        ? 'Hay cambios sin subir a tu cuenta (¿sin internet?). Conéctate y vuelve a intentarlo: así no pierdes nada.'
        : 'No se pudo cerrar sesión. Revisa la conexión.';
    }
  };
}

function unlock() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  document.body.classList.remove('locked');
  hooks.onUnlock();
}

/**
 * Arranque: si hay PIN, la app empieza bloqueada (antes de enseñar nada).
 * Al volver a la app tras `mins` minutos fuera, se bloquea otra vez.
 */
export function initLock(h = {}) {
  hooks = { ...hooks, ...h };
  if (lockEnabled()) lockNow();
  document.addEventListener('visibilitychange', () => {
    if (!lockEnabled()) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if ((lockSettings().mins || 0) === 0) lockNow(); // «al momento»: tapado ya (tampoco se ve en la multitarea)
    } else if (hiddenAt && Date.now() - hiddenAt >= (lockSettings().mins || 0) * 60e3) lockNow();
  });
}

// ---------- ajustes en Cuenta ----------
export async function renderLockSettings(box) {
  if (!box) return;
  const s = lockSettings();
  const bio = await bioAvailable();
  const minsSel = (v) => '<select id="lkmin">' + MINUTES.map((m) => '<option value="' + m + '"' + (m === v ? ' selected' : '') + '>' + (m ? 'Tras ' + m + ' min fuera' : 'Al momento') + '</option>').join('') + '</select>';
  box.innerHTML = lockEnabled()
    ? '<div><b>🔒 Bloqueo activado</b></div><div class="mut mt8">Rutivo pide el PIN al abrirla y al volver tras un rato fuera.</div>' +
      '<label class="f" for="lkmin">Bloquear</label>' + minsSel(s.mins || 0) +
      (bio ? '<label class="chk mt8"><input type="checkbox" id="lkbio"' + (s.bio ? ' checked' : '') + '> Desbloquear con Face ID / huella</label>' : '') +
      '<label class="f" for="lkcur">PIN actual (para cambiarlo o quitarlo)</label><input id="lkcur" type="password" inputmode="numeric" autocomplete="off" maxlength="6">' +
      '<label class="f" for="lknew">PIN nuevo (si quieres cambiarlo)</label><input id="lknew" type="password" inputmode="numeric" autocomplete="off" maxlength="6">' +
      '<div class="row mt8"><button type="button" class="sec" id="lkchg">Cambiar PIN</button><button type="button" class="sec danger" id="lkoff">Quitar bloqueo</button></div>' +
      '<div id="lkmsg" class="mut mt8" role="status"></div>'
    : '<div class="mut">Pide un PIN al abrir Rutivo (y Face ID o huella si quieres), para que nadie vea tus datos si coge tu móvil.</div>' +
      '<label class="f" for="lknew">PIN (4 a 6 cifras)</label><input id="lknew" type="password" inputmode="numeric" autocomplete="off" maxlength="6">' +
      '<label class="f" for="lkrep">Repite el PIN</label><input id="lkrep" type="password" inputmode="numeric" autocomplete="off" maxlength="6">' +
      '<label class="f" for="lkmin">Bloquear</label>' + minsSel(1) +
      '<button type="button" class="mt10" id="lkon">🔒 Activar bloqueo</button><div id="lkmsg" class="mut mt8" role="status"></div>';
  const $b = (q) => box.querySelector(q);
  const say = (t) => { $b('#lkmsg').textContent = t; };
  if ($b('#lkon')) {
    $b('#lkon').onclick = async () => {
      const a = $b('#lknew').value.trim();
      if (!validPin(a)) return say('El PIN tiene que tener de 4 a 6 cifras.');
      if (a !== $b('#lkrep').value.trim()) return say('Los dos PIN no coinciden.');
      await enableLock(a, +$b('#lkmin').value);
      renderLockSettings(box);
    };
    return;
  }
  $b('#lkmin').onchange = () => { setLockMinutes(+$b('#lkmin').value); say('Guardado ✓'); };
  const needCur = async () => {
    const r = await checkPin($b('#lkcur').value.trim());
    if (!r.ok) say(r.wait ? 'Demasiados intentos. Espera ' + Math.ceil(r.wait / 1000) + ' s.' : 'El PIN actual no es correcto.');
    return r.ok;
  };
  $b('#lkchg').onclick = async () => {
    const n = $b('#lknew').value.trim();
    if (!validPin(n)) return say('El PIN nuevo tiene que tener de 4 a 6 cifras.');
    if (!(await needCur())) return;
    await enableLock(n, lockSettings().mins);
    renderLockSettings(box).then(() => { box.querySelector('#lkmsg').textContent = 'PIN cambiado ✓'; });
  };
  $b('#lkoff').onclick = async () => {
    if (!(await needCur())) return;
    disableLock();
    renderLockSettings(box);
  };
  if ($b('#lkbio')) {
    $b('#lkbio').onchange = async (e) => {
      if (!e.target.checked) { disableBio(); return say('Face ID / huella desactivado.'); }
      try { await enableBio(); say('Listo: ya puedes desbloquear con Face ID / huella ✓'); } catch { e.target.checked = false; say('No se pudo activar en este móvil.'); }
    };
  }
}
