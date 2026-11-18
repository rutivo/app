import { Router } from 'express';
import {
  transferAssignSchema,
  transferCreateSchema,
  transferListQuerySchema,
  transferStatusSchema,
  transferUpdateSchema,
} from '../../domain/schemas.js';
import type { TransferService } from '../../services/transferService.js';
import { parse, parseId } from '../validate.js';

export function transferRoutes(service: TransferService): Router {
  const r = Router();
  r.get('/', (req, res) => {
    res.json(service.list(parse(transferListQuerySchema, req.query)));
  });
  r.get('/:id', (req, res) => {
    res.json(service.get(parseId(req.params.id)));
  });
  r.post('/', (req, res) => {
    res.status(201).json(service.create(parse(transferCreateSchema, req.body)));
  });
  r.patch('/:id', (req, res) => {
    res.json(service.update(parseId(req.params.id), parse(transferUpdateSchema, req.body)));
  });
  r.post('/:id/assign', (req, res) => {
    const { driverId, vehicleId } = parse(transferAssignSchema, req.body);
    res.json(service.assign(parseId(req.params.id), driverId, vehicleId));
  });
  r.post('/:id/status', (req, res) => {
    const { status } = parse(transferStatusSchema, req.body);
    res.json(service.changeStatus(parseId(req.params.id), status));
  });
  r.delete('/:id', (req, res) => {
    service.delete(parseId(req.params.id));
    res.status(204).end();
  });
  return r;
}
