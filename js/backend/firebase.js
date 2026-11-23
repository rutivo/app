// Conexión con Firebase: cuentas (Authentication) y datos (Firestore).
// Se carga solo si hay FIREBASE_CONFIG, así la versión sin nube no descarga nada.
//
// Estructura en Firestore (ver firestore.rules):
//   users/{uid}/data/{trozo}   datos de la app, troceados por mes/año
//   users/{uid}/fotos/{id}     fotos de facturas de gasolina
//   enlaces/{código}           enlaces para el cliente (los abre sin cuenta quien tenga el código)
import { APP_CHECK_SITE_KEY, FIREBASE_CONFIG, FIREBASE_SDK } from '../config.js';

let sdk = null;

async function load() {
  if (sdk) return sdk;
  const [app, auth, fs] = await Promise.all([
    import(FIREBASE_SDK + '/firebase-app.js'),
    import(FIREBASE_SDK + '/firebase-auth.js'),
    import(FIREBASE_SDK + '/firebase-firestore.js'),
  ]);
  const firebaseApp = app.initializeApp(FIREBASE_CONFIG);
  // App Check (preparado, APAGADO mientras APP_CHECK_SITE_KEY esté vacío): solo la
  // app real podrá usar Firebase. Para activarlo ver SEGURIDAD.md (clave reCAPTCHA
  // Enterprise + líneas de la CSP + «Aplicar» en la consola de Firebase).
  if (APP_CHECK_SITE_KEY) {
    // Si App Check no puede arrancar (sin conexión, reCAPTCHA bloqueado…), la app sigue igual:
    // mientras no se pulse «Aplicar» en Firebase, Firestore funciona sin el token.
    try {
      const ac = await import(FIREBASE_SDK + '/firebase-app-check.js');
      ac.initializeAppCheck(firebaseApp, { provider: new ac.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
    } catch {
      /* sin App Check esta vez */
    }
  }
  const authInstance = auth.getAuth(firebaseApp);
  authInstance.languageCode = 'es';
  sdk = { auth, fs, authInstance, db: fs.getFirestore(firebaseApp) };
  return sdk;
}

/** Mensajes de error de Firebase en español. */
const ERRORS = {
  'auth/email-already-in-use': 'Ya hay una cuenta con ese email. Entra con tu contraseña.',
  'auth/invalid-email': 'El email no es válido.',
  'auth/missing-email': 'Escribe tu email.',
  'auth/weak-password': 'La contraseña es demasiado débil: mínimo 8 caracteres, con letras y números.',
  'auth/password-does-not-meet-requirements': 'La contraseña no cumple los requisitos: mínimo 8 caracteres, con letras y números.',
  'auth/too-many-requests-verify': 'Ya te hemos enviado el email hace poco. Espera unos minutos.',
  'auth/missing-password': 'Escribe tu contraseña.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'Email o contraseña incorrectos.',
  'auth/user-disabled': 'Esta cuenta está desactivada.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
  'auth/network-request-failed': 'Sin conexión. Revisa internet e inténtalo otra vez.',
};
export const authErrorMessage = (err) => ERRORS[err && err.code] || 'No se pudo completar. Inténtalo otra vez.';

/**
 * Empieza a escuchar la sesión. `onChange(user|null)` se llama al arrancar y
 * cada vez que se entra o se sale. Lanza si no se puede cargar Firebase
 * (normalmente, por falta de conexión).
 */
export async function watchSession(onChange) {
  const { auth, authInstance } = await load();
  auth.onAuthStateChanged(authInstance, (u) => onChange(u ? { uid: u.uid, email: u.email, emailVerified: !!u.emailVerified } : null));
}

export async function register(email, password) {
  const { auth, authInstance } = await load();
  const cred = await auth.createUserWithEmailAndPassword(authInstance, email, password);
  // Email de confirmación (no bloquea: se puede usar la app mientras tanto)
  try {
    await auth.sendEmailVerification(cred.user);
  } catch {
    /* se podrá reenviar desde Cuenta */
  }
}

/** Vuelve a enviar el email de confirmación. */
export async function resendVerification() {
  const { auth, authInstance } = await load();
  if (authInstance.currentUser) await auth.sendEmailVerification(authInstance.currentUser);
}

/** ¿Ya confirmó el email? (lo pregunta al servidor) */
export async function refreshVerified() {
  const { authInstance } = await load();
  const u = authInstance.currentUser;
  if (!u) return false;
  await u.reload();
  return !!u.emailVerified;
}

export async function login(email, password) {
  const { auth, authInstance } = await load();
  await auth.signInWithEmailAndPassword(authInstance, email, password);
}

export async function resetPassword(email) {
  const { auth, authInstance } = await load();
  await auth.sendPasswordResetEmail(authInstance, email);
}

export async function logout() {
  const { auth, authInstance } = await load();
  await auth.signOut(authInstance);
}

/**
 * Borra la cuenta y todos sus datos en la nube. Pide la contraseña porque
 * Firebase exige haber entrado hace poco para borrar una cuenta.
 * `beforeDelete()` se llama tras comprobar la contraseña y antes de borrar.
 * `linkIds`: los enlaces para el cliente que creó (enlaces/{código}), que también se borran.
 */
export async function deleteAccount(password, beforeDelete, linkIds = []) {
  const { auth, fs, authInstance, db } = await load();
  const user = authInstance.currentUser;
  await auth.reauthenticateWithCredential(user, auth.EmailAuthProvider.credential(user.email, password));
  beforeDelete();
  // Si alguno ya no existe (caducado y borrado, de otro móvil…), da igual: se sigue
  await Promise.allSettled(linkIds.filter((id) => /^[A-Za-z0-9]{20}$/.test(id)).map((id) => fs.deleteDoc(fs.doc(db, 'enlaces', id))));
  for (const name of ['data', 'fotos']) {
    const snap = await fs.getDocs(fs.collection(db, 'users', user.uid, name));
    await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref)));
  }
  await auth.deleteUser(user);
}

/**
 * Almacén remoto del usuario con la misma forma que usa cloud.js:
 * list() → [{id, data}], put(id, data), remove(id), y fotos.
 */
export function userStore(uid) {
  const { fs, db } = sdk;
  const data = () => fs.collection(db, 'users', uid, 'data');
  const photo = (id) => fs.doc(db, 'users', uid, 'fotos', id);
  return {
    async list() {
      const snap = await fs.getDocs(data());
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    put: (id, value) => fs.setDoc(fs.doc(data(), id), value),
    remove: (id) => fs.deleteDoc(fs.doc(data(), id)),
    async get(id) {
      const snap = await fs.getDoc(fs.doc(data(), id));
      return snap.exists() ? snap.data() : null;
    },
    /**
     * Escribe varios documentos y la marca de versión en UNA transacción, solo si
     * la marca sigue siendo `expectTs` (nadie ha escrito desde que se leyó). Si
     * otro móvil escribió entre medias, falla con code 'stale' y no se escribe nada.
     */
    commit: ({ sets = {}, deletes = [], expectTs, newTs }) => fs.runTransaction(db, async (tx) => {
      const metaRef = fs.doc(data(), 'meta');
      const snap = await tx.get(metaRef);
      const cur = snap.exists() && typeof snap.data().ts === 'number' ? snap.data().ts : null;
      if (cur !== expectTs) throw Object.assign(new Error('stale'), { code: 'stale' });
      for (const [id, value] of Object.entries(sets)) tx.set(fs.doc(data(), id), value);
      for (const id of deletes) tx.delete(fs.doc(data(), id));
      tx.set(metaRef, { ts: newTs });
    }),
    putPhoto: (id, dataUrl) => fs.setDoc(photo(id), { d: dataUrl }),
    async getPhoto(id) {
      const snap = await fs.getDoc(photo(id));
      return snap.exists() ? snap.data().d : null;
    },
    removePhoto: (id) => fs.deleteDoc(photo(id)),
    /** Enlace para el cliente: `rec` = {d, ph?}; `exp` = hasta cuándo se puede abrir (ms). */
    putLink: (id, rec, exp) => fs.setDoc(fs.doc(db, 'enlaces', id), { ...rec, o: uid, exp: fs.Timestamp.fromMillis(exp) }),
    removeLink: (id) => fs.deleteDoc(fs.doc(db, 'enlaces', id)),
  };
}
