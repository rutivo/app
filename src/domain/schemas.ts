import { z } from 'zod';
import { TRANSFER_STATUSES } from './models.js';

const text = (max: number) => z.string().trim().min(1, 'Obligatorio').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Fecha ISO 8601 con zona horaria; se normaliza a UTC. */
const isoDateTime = z
  .string()
  .datetime({ offset: true, message: 'Debe ser fecha ISO 8601 con zona horaria' })
  .transform((v) => new Date(v).toISOString());

export const idParamSchema = z.coerce.number().int().positive();

export const driverCreateSchema = z.object({
  name: text(120),
  phone: text(40),
  license: text(40),
  active: z.boolean().default(true),
});
export const driverUpdateSchema = driverCreateSchema.partial();

export const vehicleCreateSchema = z.object({
  plate: text(20).transform((v) => v.toUpperCase()),
  model: text(120),
  seats: z.number().int().min(1).max(80),
  active: z.boolean().default(true),
});
export const vehicleUpdateSchema = vehicleCreateSchema.partial();

const transferFields = {
  customerName: text(120),
  customerPhone: text(40),
  customerEmail: z
    .string()
    .trim()
    .email('Email inválido')
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  pickupLocation: text(200),
  dropoffLocation: text(200),
  pickupAt: isoDateTime,
  durationMinutes: z.number().int().min(1).max(24 * 60),
  passengers: z.number().int().min(1).max(80),
  priceCents: z.number().int().min(0),
  notes: optionalText(1000),
};

export const transferCreateSchema = z.object(transferFields);
export const transferUpdateSchema = z.object(transferFields).partial();

export const transferAssignSchema = z.object({
  driverId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),
});

export const transferStatusSchema = z.object({
  status: z.enum(TRANSFER_STATUSES),
});

export const transferListQuerySchema = z.object({
  status: z.enum(TRANSFER_STATUSES).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  driverId: z.coerce.number().int().positive().optional(),
});

export type DriverCreate = z.infer<typeof driverCreateSchema>;
export type DriverUpdate = z.infer<typeof driverUpdateSchema>;
export type VehicleCreate = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdate = z.infer<typeof vehicleUpdateSchema>;
export type TransferCreate = z.infer<typeof transferCreateSchema>;
export type TransferUpdate = z.infer<typeof transferUpdateSchema>;
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;
