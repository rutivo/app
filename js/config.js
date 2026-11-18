// Configuración de la nube (Firebase).
//
// Mientras FIREBASE_CONFIG sea null, la app funciona como siempre: sin cuentas
// y con los datos solo en el móvil. Para activar las cuentas, sigue los pasos
// de CONFIGURAR-NUBE.md y pega aquí los datos de tu proyecto de Firebase.
//
// Estos datos NO son secretos: identifican el proyecto. La seguridad está en
// las reglas de Firestore (firestore.rules), que solo dejan a cada usuario
// leer y escribir lo suyo.
export const FIREBASE_CONFIG = null;
/* Ejemplo:
export const FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'rutivo-app.firebaseapp.com',
  projectId: 'rutivo-app',
  appId: '1:1234567890:web:abc123',
};
*/

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
