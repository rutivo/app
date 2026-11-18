import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

export function setup() {
  const db = openDatabase(':memory:');
  const api = request(createApp(db));
  return { db, api };
}

export const transferInput = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Ana López',
  customerPhone: '+34 600 000 000',
  customerEmail: 'ana@example.com',
  pickupLocation: 'Aeropuerto T1',
  dropoffLocation: 'Hotel Centro',
  pickupAt: '2026-12-01T10:00:00Z',
  durationMinutes: 60,
  passengers: 3,
  priceCents: 4500,
  ...overrides,
});
