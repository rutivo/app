# Rutivo — reglas para cualquier asistente de código

PWA para taxistas/transfers. El titular no es técnico: **responde en español, sencillo, sin tecnicismos.**
(Estas son las mismas reglas que `CLAUDE.md`; si cambian, cambian en los dos.)

## Reglas del titular
- Publicar solo tras «sí/publícalo» a «¿Lo publico?» («vale» no cuenta).
- Sin permiso: nada en Firebase producción (reglas, consola, App Check). Las reglas las pega él.
- No borrar datos/usuarios, no quitar funciones, no cambiar diseño ni lo no pedido.
- Nunca dar una prueba por buena sin ejecutarla. Calidad de producción.
- Sin secretos en código ni por chat; su email nunca a servicios externos.
- Riesgo de pérdida de datos → parar y explicar.

## Eficiencia
- Respuesta: qué cambié · resultado real · qué queda (3-5 líneas).
- Al empezar: `git log --oneline -5` y `git status`; leer `docs/claude/*.md` solo si hace falta (mapa, pruebas, estado).
- Buscar y leer solo la sección; no releer lo no cambiado; editar, no reescribir.
- Filtrar salidas largas; nunca volcar logs/base64/JSON.
- Tras publicar: un solo aviso para revisar GitHub Actions.

## Ramas y publicación
- Trabajo: `fase2/profesionalizacion` (commit + push). Respaldo: tag `respaldo-antes-fase2`.
- Producción: `claude/well-coded-application-1bvedo`, solo tras su «sí»:
  `git fetch -q origin claude/well-coded-application-1bvedo && git merge-base --is-ancestor origin/claude/well-coded-application-1bvedo HEAD && git push origin HEAD:claude/well-coded-application-1bvedo`
- Repo de producción: `pokeboostmlg-web/Gestor-Transfer-`.
- Archivo servido nuevo o cambiado → añadirlo a `FILES` en `sw.js` y ejecutar `node scripts/version-sw.mjs`.

## Cómo probar
- `npm test` (lógica, ~1 s): siempre.
- `node tests/e2e/<nombre>.e2e.cjs`: solo las tandas de lo tocado (necesita Playwright ya instalado; no ejecutar `playwright install`).
- `npm run test:e2e` completo (~35 min): solo antes de publicar cambios amplios.
- Más detalle: `docs/claude/pruebas.md`; mapa del código: `docs/claude/mapa.md`; estado: `docs/claude/estado.md`.
