// Conexión con Firebase: cuentas (Authentication) y datos (Firestore).
// Se carga solo si hay FIREBASE_CONFIG, así la versión sin nube no descarga nada.
//
// Estructura en Firestore (ver firestore.rules):
//   users/{uid}/data/{trozo}   datos de la app, troceados por mes/año
//   users/{uid}/fotos/{id}     fotos de facturas de gasolina
import { FIREBASE_CONFIG, FIREBASE_SDK } from '../config.js';

let sdk = null;

async function load() {
  if (sdk) return sdk;
  const [app, auth, fs] = await Promise.all([
    import(FIREBASE_SDK + '/firebase-app.js'),
    import(FIREBASE_SDK + '/firebase-auth.js'),
    import(FIREBASE_SDK + '/firebase-firestore.js'),
  ]);
  const firebaseApp = app.initializeApp(FIREBASE_CONFIG);
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
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
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
  auth.onAuthStateChanged(authInstance, (u) => onChange(u ? { uid: u.uid, email: u.email } : null));
}

export async function register(email, password) {
  const { auth, authInstance } = await load();
  await auth.createUserWithEmailAndPassword(authInstance, email, password);
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
 */
export async function deleteAccount(password, beforeDelete) {
  const { auth, fs, authInstance, db } = await load();
  const user = authInstance.currentUser;
  await auth.reauthenticateWithCredential(user, auth.EmailAuthProvider.credential(user.email, password));
  beforeDelete();
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
    putPhoto: (id, dataUrl) => fs.setDoc(photo(id), { d: dataUrl }),
    async getPhoto(id) {
      const snap = await fs.getDoc(photo(id));
      return snap.exists() ? snap.data().d : null;
    },
    removePhoto: (id) => fs.deleteDoc(photo(id)),
  };
}
