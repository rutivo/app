# Seguridad de Rutivo

Qué protege la app, cómo, y qué hay que revisar en cada servicio.

## Lo que ya está en el código

| Riesgo | Protección |
|---|---|
| Que alguien cuele código con un texto (nombre de cliente, servicio pegado, nota, copia de seguridad…) | Todo lo que se pinta pasa por `esc()`. Probado metiendo código en **todos** los campos y recorriendo todas las pantallas: no se ejecuta nada. |
| Que se ejecute código de otra web | **Content-Security-Policy** en `index.html`: solo se ejecuta código de la propia app, de Firebase (Google) y del lector de tickets (jsDelivr, versión fija). Sin `eval`, sin plugins, sin `<base>` ni formularios hacia fuera. |
| Que un servidor de librerías sea atacado y cambie el código | jsPDF, html2canvas, pdf.js y Leaflet van **dentro de la app** (`vendor/`, versiones fijas, sumas en `vendor/SHA256SUMS`). |
| Que alguien lea o cambie datos de otro usuario | **Reglas de Firestore** (`firestore.rules`): cada uno solo accede a `users/{su uid}`, solo a los documentos que usa la app, con forma y tamaño limitados; todo lo demás cerrado. |
| Contraseñas fáciles | Las cuentas nuevas necesitan 8+ caracteres con letras y números, sin el email ni contraseñas típicas. Borrar la cuenta pide la contraseña otra vez. |
| Que gasten tus consultas de vuelos | El intermediario (`worker/vuelos.js`) solo responde a `https://rutivo.github.io`, solo GET, solo fechas cercanas, valida el número de vuelo, guarda en caché y limita cada IP a 40 consultas/hora de vuelos y 400 de posición. La clave de AeroDataBox es un secreto de Cloudflare: no está en el código ni en el móvil. |
| Enlaces que filtran datos | `Referrer-Policy: strict-origin-when-cross-origin`; los enlaces externos llevan `rel="noopener noreferrer"`. |
| Datos del móvil en otras webs | Se guardan en el almacenamiento propio de la app (solo los lee `rutivo.github.io`). |

`js/config.js` tiene la configuración de Firebase: **no es secreta** (identifica el proyecto); la seguridad la dan las reglas y las restricciones de la clave.

## Lo que hay que hacer en cada servicio (una vez)

1. **Firebase → Firestore → Reglas**: pegar `firestore.rules` y **Publicar**.
2. **Firebase → Authentication → Configuración**:
   - *Política de contraseñas*: mínimo 8, exigir números, **Exigir** (no solo avisar).
   - *Protección contra la enumeración de correos*: activada.
   - *Dominios autorizados*: solo `rutivo.github.io` (y los de Firebase).
3. **Google Cloud → APIs y servicios → Credenciales → Browser key**:
   - Restricción de aplicaciones: *Sitios web* → `https://rutivo.github.io/*`.
   - Restricción de API: Identity Toolkit API, Token Service API, Cloud Firestore API.
4. **Verificación en dos pasos (2FA)** en: GitHub, Google (Firebase), Cloudflare y RapidAPI.
5. **Cloudflare → My Profile → API Tokens**: anular los tokens que ya no se usen.

## Al cambiar el código

- Servicio externo nuevo → añadir su dirección a la CSP de `index.html`.
- Librería nueva → meterla en `vendor/` con versión fija y actualizar `SHA256SUMS`.
- Texto del usuario en HTML → siempre con `esc()`.

## Avisos con la app cerrada

- La clave privada de las notificaciones (VAPID) está solo en Cloudflare como
  secreto; en la app va únicamente la pública.
- El servidor solo acepta peticiones de rutivo.github.io, limita por IP, revisa
  y recorta todo lo que llega (máx. 40 avisos, textos cortos, fechas cercanas)
  y solo envía a servicios de notificaciones reales (Apple, Google, Mozilla,
  Microsoft): no se puede usar para mandar peticiones a otras webs.
- Cada aviso guarda solo el texto que se va a mostrar y, en los «Sal ya», el
  número de vuelo. Se borran al enviarse; al desactivar los avisos se borra todo.
- «¿Me compensa?» y «Sal ya» consultan rutas en OpenStreetMap (Nominatim) y OSRM
  sin clave. Tu posición solo se usa en el móvil para calcular el camino; a esos
  servicios solo les llegan coordenadas sueltas, sin tu nombre ni tus datos.

## Endurecimiento (noviembre 2026)

- **Política de seguridad (CSP) por versión exacta:** solo se ejecuta código de la
  app y de `tesseract.js@5.1.1` (no de todo jsDelivr). Firebase (10.14.1) va dentro de la app,
  en `vendor/firebasejs-10.14.1/` (del paquete oficial de npm; vigilado con SHA-256).
  `base-uri 'none'`, `upgrade-insecure-requests`, conexiones a Google limitadas a
  Firestore, Identity Toolkit y Secure Token.
- **Fuente propia** (Manrope, licencia OFL) en `fonts/`: sin llamadas a Google Fonts
  (también evita enviar la IP de los usuarios a Google).
- **Anti-clickjacking:** la app no se muestra dentro de otra web (GitHub Pages no
  permite la cabecera `frame-ancestors`; se hace en `js/main.js`).
- **Datos de fuera saneados** (copias de seguridad, nube, almacenamiento): solo las
  listas conocidas, sin claves `__proto__`/`constructor`, profundidad limitada.
- **CSV sin fórmulas:** las celdas que empiezan por `= + - @` llevan un apóstrofo
  para que Excel no las ejecute (inyección de fórmulas).
- **Servidor:** cabeceras `CSP default-src 'none'`, `X-Frame-Options`, HSTS;
  `/avisos` solo acepta JSON; tope global de consultas de vuelos por hora (también
  las de los avisos) y máximo 12 avisos con vuelo por móvil.

### Tareas del titular (fuera del código)

1. Google Cloud → APIs y servicios → Credenciales → clave de Firebase:
   restringir a sitios web `https://rutivo.github.io/*` y a las APIs Identity
   Toolkit, Token Service y Cloud Firestore.
2. Firebase → Authentication → Configuración: protección contra enumeración de
   emails activada y política de contraseñas (mínimo 8, con números).
3. Verificación en dos pasos en GitHub, Google (Firebase), Cloudflare y RapidAPI.
4. Revocar el token de Cloudflare compartido en el chat cuando no haga falta (caduca el 26/11).


## Fase 1 · Tarea 4: configuración de Firebase (la hace el titular en las consolas)

Nada de esto se ha cambiado desde el código. Son pasos manuales y reversibles.

### 1. Política de contraseñas (Firebase → Authentication → Configuración → Política de contraseñas)
- Modo: **Exigir** (o «Notificar» unos días si hay usuarios con contraseñas antiguas).
- Longitud mínima **8**; exigir **minúscula** o **mayúscula** y **número**
  (igual que la app: 8 caracteres, letras y números).
- La app ya muestra el error `auth/password-does-not-meet-requirements` en español.

### 2. Protección contra la enumeración de emails (Authentication → Configuración → Acciones del usuario)
- Activar «**Protección contra la enumeración de correos electrónicos**».
- Con ella activa, Firebase deja de decir si un email tiene cuenta (la app ya
  muestra un mensaje genérico «Email o contraseña incorrectos»).

### 3. Plantillas de email (Authentication → Plantillas)
- Idioma **español** para «Verificación de correo» y «Restablecer contraseña».
- La app envía el email de verificación al crear la cuenta y deja reenviarlo
  desde Cuenta. No bloquea a quien no lo confirme.

### 4. Restringir la clave pública de Firebase (Google Cloud → APIs y servicios → Credenciales)
Clave «Browser key (auto created by Firebase)» del proyecto `rutivo-a8890`:
- **Restricciones de aplicación** → Sitios web → `https://rutivo.github.io/*`
  (y, solo si se prueba en local, `http://localhost/*`).
- **Restricciones de API** → limitar a: *Identity Toolkit API*, *Token Service API*,
  *Cloud Firestore API* (y *Firebase App Check API* cuando se active App Check).
- Comprobar después que entrar, sincronizar y borrar cuenta siguen funcionando.

### 5. App Check (Fraud Defense / reCAPTCHA Enterprise; registrada el 21/11/2026)
1. Clave de sitio creada en www.google.com/recaptcha/admin (dominio `rutivo.github.io`).
   Firebase ya no deja registrar apps nuevas con reCAPTCHA «Classic» (v3): la misma clave
   se registró en Firebase → App Check → Apps → **Fraud Defense** (estado «Registrada»).
2. La clave del sitio (pública) está en `js/config.js` → `APP_CHECK_SITE_KEY`; el código
   usa `ReCaptchaEnterpriseProvider`. La CSP de `index.html` ya permite
   `www.google.com/recaptcha/`, `www.gstatic.com/recaptcha/`, `recaptcha.google.com/recaptcha/`
   y `content-firebaseappcheck.googleapis.com`.
3. Publicar y mirar unos días en Firebase → App Check → **Métricas** que las peticiones
   llegan «verificadas». Solo entonces pulsar **Aplicar** en Cloud Firestore.
4. Si App Check falla al arrancar (sin conexión, reCAPTCHA bloqueado), la app sigue
   funcionando: mientras no se pulse «Aplicar», Firestore no lo exige.
5. **Enlaces para el cliente:** `cliente.html` ya manda su prueba de App Check
   (reCAPTCHA Enterprise invisible, cabecera `X-Firebase-AppCheck`) al leer el enlace
   corto; si no la consigue en 6 s, lo pide igual (sirve mientras no se «Aplique»).
   Antes de pulsar «Aplicar»: publicar, esperar unos días y comprobar en Métricas que las
   lecturas de la página del cliente también llegan «verificadas».

### Comprobado en el código
- **Aislamiento entre usuarios**: las reglas reales (`firestore.rules`) probadas
  con el **emulador oficial de Firestore**: 28/28 (`tests/rules/`).
- Retirada la licencia de prueba de 15 días (`js/license.js`, desactivada) que
  llevaba su clave secreta dentro del código.
- La puerta de pruebas del reconocedor de voz (`__rutivoEarSrc`) solo funciona en
  `localhost`/`127.0.0.1`; en la app publicada se ignora.

## Revisión externa (22/11/2026) y bloqueo con PIN

Un tercero hizo una prueba sin datos reales: sin sesión no se puede leer Firestore
(403), HTTPS/HSTS correcto, sin XSS reflejado, copias con `__proto__` bloqueadas y
sin vulnerabilidades conocidas en Firebase 10.14.1 ni Tesseract 5.1.1.

- **Datos en el móvil sin cifrar (medio):** se añade un **bloqueo con PIN opcional**
  (Cuenta → Seguridad, `js/bloqueo.js`): PIN de 4-6 cifras guardado solo como huella
  PBKDF2-SHA-256 (150.000 vueltas, sal aleatoria), espera creciente desde el 5.º fallo,
  bloqueo al abrir y al volver tras 0/1/5/15 min, contenido oculto mientras tanto,
  «Oye Rutivo» en pausa, y Face ID / huella (WebAuthn, autenticador del móvil,
  verificación obligatoria). «He olvidado el PIN» sube lo pendiente y cierra sesión;
  si algo no se puede subir, no sale. Al cerrar sesión ya se borraban los datos del
  móvil (y ahora también el bloqueo). No es cifrado de los datos guardados: protege
  frente a quien coge el móvil, no frente a software malicioso con acceso al navegador.
- **Cabeceras HTTP (bajo):** GitHub Pages no deja ponerlas. `Referrer-Policy` ya va
  como `<meta>` y el anti-iframe por código. `X-Content-Type-Options`,
  `Permissions-Policy` y `frame-ancestors` quedan para el paso a Cloudflare Pages
  (archivo `_headers`) junto con el dominio propio.
- **Cuentas de prueba** `rutivo-audit-…@example.invalid`: las borra el titular en
  Firebase → Authentication → Users.

## Enlace para el cliente (`cliente.html`)

- **Enlace corto (con cuenta):** los datos del enlace se guardan en `enlaces/{código}`,
  con un código de 20 letras y números al azar (≈ 119 bits, imposible de adivinar). Reglas:
  - lectura **sin cuenta** de ESE documento y solo hasta su caducidad (2 días después del
    servicio, como mucho 45 días); **no se pueden listar** ni buscar enlaces;
  - solo lo escribe, cambia o borra el conductor que lo creó (campo `o` = su cuenta);
  - forma fija: `d` (datos, texto < 4.000), `ph` (foto JPEG, ≤ 200.000: unos 150 KB, buena calidad), `exp`
    (fecha), `st` (estado, para el paso 2), nada más.
  - Al borrar el servicio en la app, su enlace se borra; al eliminar la cuenta, se borran todos sus enlaces. Los caducados ya no se pueden leer;
    para que además se borren solos, se puede activar en la consola una política TTL sobre
    el campo `exp` de la colección `enlaces` (opcional).
- **Sin cuenta o sin conexión:** el enlace lleva los datos dentro, después de `#` (esa parte
  no llega a ningún servidor). Es largo, pero funciona igual.
- El enlace lleva solo lo que el cliente necesita: su nombre de pila, tu nombre, tu
  teléfono, tu coche y matrícula, el punto de encuentro (y su foto), su vuelo, fecha, hora,
  origen y destino. **Nunca** el precio, la agencia, tu NIF ni otros datos.
- Quien tenga el enlace ve esos datos: es como reenviar el mensaje de WhatsApp.
- A prueba de enlaces y documentos manipulados: solo se aceptan los campos conocidos, como
  texto, con tamaño y formato comprobados (fecha, hora, vuelo, teléfono, foto solo JPEG);
  todo se pinta con `textContent`, y la CSP de la página solo permite sus propios archivos,
  Firestore y el intermediario de vuelos.
- La página solo pregunta por el vuelo de 8 h antes a 4 h después de la recogida.
- Pruebas: reglas con el emulador oficial (`tests/rules`), y `tests/e2e/enlace*.e2e.cjs`.
