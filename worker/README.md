# Intermediario de vuelos (Cloudflare Worker)

`vuelos.js` recibe `GET /flight?n=FR4250&d=2026-11-19`, consulta AeroDataBox
(RapidAPI) con la clave guardada como secreto `RAPIDAPI_KEY` y devuelve un
resumen: aerolínea, origen, destino, horas programadas, estimadas y reales,
terminal y estado. Guarda cada respuesta 5 minutos en caché para gastar menos
consultas, y solo acepta peticiones desde rutivo.github.io.

Una vez desplegado, pon su dirección en `FLIGHT_API` dentro de `js/config.js`.
