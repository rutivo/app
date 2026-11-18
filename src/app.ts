import express, { type Express } from 'express';
import { fileURLToPath } from 'node:url';
import type { Database } from './db/database.js';
import { errorHandler, notFoundHandler } from './http/errorHandler.js';
import { driverRoutes, vehicleRoutes } from './http/routes/fleet.js';
import { transferRoutes } from './http/routes/transfers.js';
import { DriverRepository } from './repositories/driverRepository.js';
import { TransferRepository } from './repositories/transferRepository.js';
import { VehicleRepository } from './repositories/vehicleRepository.js';
import { FleetService } from './services/fleetService.js';
import { TransferService } from './services/transferService.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

/** Composición de la aplicación: inyecta la base de datos en repositorios y servicios. */
export function createApp(db: Database): Express {
  const drivers = new DriverRepository(db);
  const vehicles = new VehicleRepository(db);
  const transfers = new TransferRepository(db);
  const fleet = new FleetService(drivers, vehicles, transfers);
  const transferService = new TransferService(db, transfers, drivers, vehicles);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/drivers', driverRoutes(fleet));
  app.use('/api/vehicles', vehicleRoutes(fleet));
  app.use('/api/transfers', transferRoutes(transferService));
  app.use('/api', notFoundHandler);

  app.use(express.static(PUBLIC_DIR));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
