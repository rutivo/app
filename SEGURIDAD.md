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
  app y de `firebasejs/10.14.1` y `tesseract.js@5.1.1` (no de todo jsDelivr/gstatic).
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
