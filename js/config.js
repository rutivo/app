// Configuración de la nube (Firebase).
//
// Si FIREBASE_CONFIG fuera null, la app funciona como siempre: sin cuentas
// y con los datos solo en el móvil. Para activar las cuentas, sigue los pasos
// de CONFIGURAR-NUBE.md y pega aquí los datos de tu proyecto de Firebase.
//
// Estos datos NO son secretos: identifican el proyecto. La seguridad está en
// las reglas de Firestore (firestore.rules), que solo dejan a cada usuario
// leer y escribir lo suyo.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCN-t9oJWgYt71-tVLeBj-WSqoXjFtsAbQ',
  authDomain: 'rutivo-a8890.firebaseapp.com',
  projectId: 'rutivo-a8890',
  storageBucket: 'rutivo-a8890.firebasestorage.app',
  messagingSenderId: '1039050890607',
  appId: '1:1039050890607:web:1e0676d10d73e9c77a9c9a',
};
/* Ejemplo:
export const FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'rutivo-app.firebaseapp.com',
  projectId: 'rutivo-app',
  appId: '1:1234567890:web:abc123',
};
*/

// Periodo de prueba de 15 días con código de activación (js/license.js).
// Desactivado: la app es gratis. Ponlo a true para volver a exigir activación.
export const TRIAL_ENABLED = false;

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
