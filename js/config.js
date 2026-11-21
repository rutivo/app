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

// App Check de Firebase (solo la app real puede usar tu Firebase), con reCAPTCHA v3
// (gratuito). Es la clave PÚBLICA del sitio (la secreta está solo en Firebase).
// Vacío = apagado. Ver SEGURIDAD.md («App Check»).
export const APP_CHECK_SITE_KEY = '6LfW5isuAAAAAO98df1QtT1Sc77iZgKVvSIon5Q8';

// Dirección del intermediario de vuelos (Cloudflare Worker, ver worker/).
// Con null, el panel del vuelo solo muestra la ruta y el enlace a Flightradar24.
export const FLIGHT_API = 'https://rutivo-vuelos.pokeboostmlg.workers.dev';

// Firebase va DENTRO de la app (vendor/, versión fija, vigilada con SHA-256 en las pruebas):
// así no se descarga código de fuera que alguien pudiera cambiar por el camino.
export const FIREBASE_SDK = new URL('../vendor/firebasejs-10.14.1', import.meta.url).href;

// Clave PÚBLICA de las notificaciones (Web Push). La privada está solo en Cloudflare.
export const PUSH_PUBLIC_KEY = 'BNm82hdTr_BgkIe4--gxDuMuDa6IcKIb8LN5TCeKnTHhPiM2gHVCocZO9C1eVej948Ug02380ieiSiCEMsvJJuY';
