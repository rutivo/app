# Rutivo — guía para Claude (leer entera; es corta a propósito)

PWA para taxistas/transfers (Málaga). Producción: https://rutivo.github.io/app/ (GitHub Pages).
Titular: Alejandro (no técnico). **Responde en español, lenguaje sencillo, sin tecnicismos.**

## Reglas del titular (obligatorias, siempre)
- No publicar sin un «sí»/«publícalo» explícito **a la pregunta «¿Lo publico?»**. «Vale», «de lujo»… no cuentan.
- No tocar Firebase en producción (reglas, consola, App Check «Aplicar») sin autorización. Las reglas las pega él.
- No borrar datos ni usuarios. No quitar funciones ni cambiar el diseño sin que lo pida. No tocar lo no pedido.
- Nunca afirmar que una prueba pasa sin ejecutarla. Calidad de producción, sin parches.
- Sin claves privadas en el código; nunca pedir secretos por chat; no enviar su email a servicios externos.
- Riesgo de pérdida de datos → parar y explicar antes de seguir.

## Forma de trabajar (ahorro de tokens sin perder calidad)
- Respuesta a una modificación: **qué cambié · resultado (pruebas reales) · si queda algo**, en 3-5 líneas.
  Más largo solo si lo pide o hay que decidir algo.
- No repetir sus instrucciones ni resumir lo ya dicho. Sin documentación nueva salvo que haga falta.
- Buscar con Grep/`grep -n` y leer **solo la sección** (`sed -n a,bp` / Read con offset). No releer archivos sin cambios.
- Cambios pequeños con Edit; no reescribir archivos enteros. Reutilizar lo existente (ver mapa).
- Salidas largas: filtrar (`| grep -E "^FAIL|passed$"`, `| tail`). Nunca volcar logs, base64 ni JSON enteros.
- Pruebas: solo las afectadas por el cambio; la batería e2e completa (~35 min, en segundo plano) solo antes de publicar
  cambios amplios. No lanzar pruebas mientras se editan archivos (falsean resultados).
- Capturas solo para cambios visuales, a escala 1 si son para mí; mirarlas una vez.
- Tras publicar: un único `send_later` para revisar GitHub Actions; no encadenar avisos.

## Ramas y publicación
- Trabajo: `fase2/profesionalizacion` (commit + push siempre). Copia de seguridad: tag `respaldo-antes-fase2`.
- Producción: rama `claude/well-coded-application-1bvedo`. Publicar = tras su «sí»:
  `git fetch -q origin claude/well-coded-application-1bvedo && git merge-base --is-ancestor origin/claude/well-coded-application-1bvedo HEAD && git push origin HEAD:claude/well-coded-application-1bvedo`
- Repo GitHub: `pokeboostmlg-web/Gestor-Transfer-` (redirige a rutivo/app). CI «Pruebas» (lógica, librerías, reglas).
- **Tras tocar cualquier archivo de `sw.js` FILES: `node scripts/version-sw.mjs`** (si no, falla la prueba de sw).
  Archivo nuevo servido → añadirlo a FILES en `sw.js`.

## Comandos
- `npm test` (lógica, ~1 s) · `node tests/e2e/<x>.e2e.cjs` (una tanda) · `npm run test:e2e` (todas, ~35 min)
- `npm run test:rules` (emulador Firestore; requiere `npm ci --ignore-scripts` y Java) · sin `playwright install`.

## Mapa (vanilla JS, módulos ES, sin build)
- Arranque/pestañas: `js/main.js` (Caja `hoy`, Transfer `tr`, Gasolina `ga`, Facturas `fa`, Panel `pa`, Cuenta `cu`).
- Estado: `js/store.js` (`S`: mov, srv, gas, huc*, prv, jor, fac, cli, cfg) → localStorage + `js/cloud.js` (sync)
  + `js/sync/{shards,merge}.js` (trozos por mes, transacción con marca, fusión). *huc = Hucha eliminada de la UI, datos conservados.
- Firebase: `js/backend/firebase.js` (auth, userStore, putLink/removeLink), reglas `firestore.rules`
  (copia en `CONFIGURAR-NUBE.md`: actualizarla si cambian).
- Vistas: `js/views/*.js` (caja, transfer, panel, gasolina, facturas, cuenta, enlace, mensajes, bienvenida, asistente, manosLibres…).
  Lógica pura testeable en `js/*.js` (graficas, panel, enlace, mensajes, money, report, trips, flightStatus, compensa…).
- Enlace cliente: `cliente.html` + `js/cliente.js` + `js/enlace.js`. Corto: `enlaces/{id20}` + marca `users/{uid}/enlaces/{id}`.
- Asistente: `js/asistente.js` (reglas/regex, sin LLM; `ask()` puro), acciones `js/vozAcciones.js`,
  voz `js/oido.js`+`oidoWorker.js` (Whisper small para órdenes, base para «Oye Rutivo»), `despertar.js`, `kws.js`, `microfono.js`.
- Worker Cloudflare (`worker/`): vuelos (AeroDataBox) y avisos push. Config pública en `js/config.js`.

## Pruebas: trampas conocidas
- e2e usan `tests/e2e/firebase-falso.cjs` (Firestore simulado que imita las reglas; si cambian las reglas, cambiarlo).
- Servicios en las próximas 12 h abren el aviso «Transfer programado»: cerrar «Entendido» antes de clicar.
- `eur()` usa espacio duro antes de «€»: en regex usar `\s€`.
- La voz real se midió con `scratchpad` (Piper + ruido de coche); el archivo `tests/fixtures/voz/coche.wav` **contiene una voz**, no usarlo como ruido.

## Decisiones tomadas (no redescubrir)
- Gráficas y asistente cuentan gasolina desde `S.mov` (categoría), no desde tickets.
- App Check registrado, **sin aplicar** (métricas al 40 % verificado el 23/11). Antes de aplicar: >~95 % verificado.
- Reglas con enlaces sin uid (`be4c44d`) pendientes de que él las pegue tras publicar.
- Pendiente (de pago o suyo): copias de seguridad Firestore (plan Blaze), pagos/suscripciones, Verifactu (autónomos jul. 2027), NIF en aviso legal.
