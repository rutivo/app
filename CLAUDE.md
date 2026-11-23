# Rutivo — reglas para Claude

PWA para taxistas/transfers. Titular no técnico: **español, sencillo, sin tecnicismos.**

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
- Grep + leer solo la sección; no releer lo no cambiado; Edit, no reescribir.
- Filtrar salidas largas; nunca volcar logs/base64/JSON.
- Tras publicar: un solo aviso para revisar GitHub Actions.

## Ramas y publicación
- Trabajo: `fase2/profesionalizacion` (commit+push). Respaldo: tag `respaldo-antes-fase2`.
- Producción `claude/well-coded-application-1bvedo`, tras su «sí»:
  `git fetch -q origin claude/well-coded-application-1bvedo && git merge-base --is-ancestor origin/claude/well-coded-application-1bvedo HEAD && git push origin HEAD:claude/well-coded-application-1bvedo`
- Repo: `pokeboostmlg-web/Gestor-Transfer-`.
- Archivo servido nuevo/cambiado → FILES en `sw.js` + `node scripts/version-sw.mjs`.
