import { Router } from 'express';
import {
  driverCreateSchema,
  driverUpdateSchema,
  vehicleCreateSchema,
  vehicleUpdateSchema,
} from '../../domain/schemas.js';
import type { FleetService } from '../../services/fleetService.js';
import { parse, parseId } from '../validate.js';

export function driverRoutes(fleet: FleetService): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json(fleet.listDrivers());
  });
  r.get('/:id', (req, res) => {
    res.json(fleet.getDriver(parseId(req.params.id)));
  });
  r.post('/', (req, res) => {
    res.status(201).json(fleet.createDriver(parse(driverCreateSchema, req.body)));
  });
  r.patch('/:id', (req, res) => {
    res.json(fleet.updateDriver(parseId(req.params.id), parse(driverUpdateSchema, req.body)));
  });
  r.delete('/:id', (req, res) => {
    fleet.deleteDriver(parseId(req.params.id));
    res.status(204).end();
  });
  return r;
}

export function vehicleRoutes(fleet: FleetService): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    res.json(fleet.listVehicles());
  });
  r.get('/:id', (req, res) => {
    res.json(fleet.getVehicle(parseId(req.params.id)));
  });
  r.post('/', (req, res) => {
    res.status(201).json(fleet.createVehicle(parse(vehicleCreateSchema, req.body)));
  });
  r.patch('/:id', (req, res) => {
    res.json(fleet.updateVehicle(parseId(req.params.id), parse(vehicleUpdateSchema, req.body)));
  });
  r.delete('/:id', (req, res) => {
    fleet.deleteVehicle(parseId(req.params.id));
    res.status(204).end();
  });
  return r;
}
