# Intermediario de vuelos (Cloudflare Worker)

`vuelos.js` recibe `GET /flight?n=FR4250&d=2026-11-19`, consulta AeroDataBox
(RapidAPI) con la clave guardada como secreto `RAPIDAPI_KEY` y devuelve un
resumen: aerolínea, origen, destino, horas programadas, estimadas y reales,
terminal y estado. Guarda cada respuesta 5 minutos en caché para gastar menos
consultas, y solo acepta peticiones desde rutivo.github.io.

Una vez desplegado, pon su dirección en `FLIGHT_API` dentro de `js/config.js`.

## Avisos con la app cerrada (Web Push)

`POST /avisos` (solo desde rutivo.github.io) recibe la suscripción de
notificaciones del móvil y su lista de avisos de las próximas horas. Cada móvil
tiene su «despertador» (Durable Object `Avisos`, en `avisos.js`) que:

- envía cada aviso a su hora (Web Push cifrado, `push.js`, sin librerías);
- en los «Sal ya» de recogidas en el aeropuerto, revisa el vuelo 90 y 35 min
  antes y, si se retrasa o adelanta, mueve la salida y avisa del cambio;
- borra todo cuando el móvil se da de baja o la suscripción caduca.

Solo envía a los servicios de notificaciones de Apple, Google, Mozilla y
Microsoft. Secretos: `VAPID_PRIVATE` (clave privada JWK). La pública está en
`js/config.js` (`PUSH_PUBLIC_KEY`). Despliegue: módulos `vuelos.js` (principal),
`avisos.js` y `push.js`, con el enlace `AVISOS` → clase `Avisos`.
