# Gestor Transfer

Aplicación web para gestionar traslados de pasajeros: reservas, conductores y vehículos.

## Funcionalidades

- **Traslados**: alta, edición, filtros por estado y día, y ciclo de vida
  `pendiente → asignado → en curso → completado` (o `cancelado`).
- **Asignación** de conductor y vehículo con validación de:
  - conductor y vehículo activos,
  - plazas suficientes para los pasajeros,
  - que ninguno de los dos tenga otro servicio que se solape en el tiempo.
- **Conductores y vehículos**: alta, activar/desactivar y borrado (solo si no tienen traslados).

## Requisitos

Node.js 22.5 o superior (usa el módulo SQLite integrado `node:sqlite`; no hay dependencias nativas).

## Uso

```bash
npm install
npm run dev          # desarrollo con recarga: http://localhost:3000
npm test             # tests de la API
npm run typecheck
npm run build && npm start   # producción
```

Variables de entorno:

| Variable        | Por defecto                  |
| --------------- | ---------------------------- |
| `PORT`          | `3000`                       |
| `DATABASE_PATH` | `data/gestor-transfer.db`    |

## Arquitectura

```
src/
  domain/        modelos, esquemas de validación (zod) y errores de dominio
  db/            conexión SQLite y migraciones versionadas
  repositories/  acceso a datos (SQL parametrizado)
  services/      reglas de negocio (asignación, solapamientos, estados)
  http/          rutas Express, validación y manejo de errores
  app.ts         composición de la aplicación
  server.ts      arranque y apagado ordenado
public/          interfaz web (HTML, CSS y JS sin frameworks)
tests/           tests de integración de la API (vitest + supertest)
```

Las fechas se guardan en UTC (ISO 8601) y el dinero en céntimos para evitar errores de redondeo.

## API

| Método | Ruta                          | Descripción                              |
| ------ | ----------------------------- | ---------------------------------------- |
| GET    | `/api/transfers`              | Lista (`?status=&from=&to=&driverId=`)   |
| POST   | `/api/transfers`              | Crea un traslado                         |
| GET    | `/api/transfers/:id`          | Detalle                                  |
| PATCH  | `/api/transfers/:id`          | Edita (solo pendiente o asignado)        |
| POST   | `/api/transfers/:id/assign`   | `{ driverId, vehicleId }`                |
| POST   | `/api/transfers/:id/status`   | `{ status }`                             |
| DELETE | `/api/transfers/:id`          | Borra (solo pendiente o cancelado)       |
| …      | `/api/drivers`, `/api/vehicles` | CRUD (GET, POST, PATCH, DELETE)        |

Los errores siguen el formato `{ "error": { "code", "message", "details" } }` con
códigos 400 (validación), 404, 409 (conflicto) y 422 (regla de negocio).
