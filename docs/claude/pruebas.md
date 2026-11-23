# Pruebas (consultar al probar)

- `npm test`: lógica, ~1 s. Siempre.
- `node tests/e2e/<x>.e2e.cjs`: solo las tandas de lo tocado (p. ej. asistente → secretario, asistente-transfer, manoslibres;
  enlace → enlace, enlace-corto, panel; nube → sync-dispositivos, facturas-sync; PIN → bloqueo, pantallas).
- `npm run test:e2e` (~35 min, en segundo plano): solo antes de publicar cambios amplios o de varias áreas. No repetir sin cambios.
- `npm run test:rules`: si cambian las reglas (requiere `npm ci --ignore-scripts` y Java).
- No lanzar pruebas mientras se editan archivos (falsean resultados). Filtrar salida: `| grep -E "^FAIL|passed$"`.
- Trampas: servicios en las próximas 12 h abren «Transfer programado» (cerrar «Entendido»); `eur()` usa espacio duro (`\s€`);
  `tests/fixtures/voz/coche.wav` contiene una voz (no usar como ruido). Sin `playwright install`.
