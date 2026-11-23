# Mapa técnico de Rutivo (consultar solo si la tarea lo necesita)

- Vanilla JS, módulos ES, sin build. Arranque/pestañas: `js/main.js` (Caja `hoy`, Transfer `tr`, Gasolina `ga`, Facturas `fa`, Panel `pa`, Cuenta `cu`).
- Estado: `js/store.js` (`S`: mov, srv, gas, huc*, prv, jor, fac, cli, cfg) → localStorage + `js/cloud.js` (sync)
  + `js/sync/{shards,merge}.js` (trozos por mes, transacción con marca, fusión). *huc: Hucha quitada de la UI, datos conservados.
- Firebase: `js/backend/firebase.js` (auth, userStore, putLink/removeLink). Reglas `firestore.rules`
  (copia en `CONFIGURAR-NUBE.md`: actualizarla si cambian; también `tests/e2e/firebase-falso.cjs` y `tests/rules/reglas.test.mjs`).
- Vistas: `js/views/*.js`. Lógica pura testeable en `js/*.js` (graficas, panel, enlace, mensajes, money, report, trips, flightStatus, compensa…).
- Enlace cliente: `cliente.html` + `js/cliente.js` + `js/enlace.js`. Corto: `enlaces/{id20}` + marca `users/{uid}/enlaces/{id}`.
- Asistente: `js/asistente.js` (reglas/regex, sin LLM; `ask()` puro), acciones `js/vozAcciones.js`; voz `js/oido.js`+`oidoWorker.js`
  (Whisper small para órdenes, base para «Oye Rutivo»), `despertar.js`, `kws.js`, `microfono.js`.
- Worker Cloudflare (`worker/`): vuelos (AeroDataBox) y avisos push. Config pública: `js/config.js`.
- Seguridad: `SEGURIDAD.md`. Aviso legal y privacidad: `legal.html`.
