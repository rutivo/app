import { beforeEach, describe, expect, it } from 'vitest';
import { setup, transferInput } from './helpers.js';

describe('traslados', () => {
  let api: ReturnType<typeof setup>['api'];
  let driverId: number;
  let vehicleId: number;

  beforeEach(async () => {
    ({ api } = setup());
    driverId = (await api.post('/api/drivers').send({ name: 'Luis', phone: '1', license: 'L1' })).body.id;
    vehicleId = (await api.post('/api/vehicles').send({ plate: 'V1', model: 'Van', seats: 4 })).body.id;
  });

  const createTransfer = async (overrides = {}) =>
    (await api.post('/api/transfers').send(transferInput(overrides))).body;

  it('crea un traslado pendiente y normaliza la fecha a UTC', async () => {
    const t = await createTransfer({ pickupAt: '2026-12-01T11:00:00+01:00' });
    expect(t.status).toBe('pending');
    expect(t.pickupAt).toBe('2026-12-01T10:00:00.000Z');
  });

  it('rechaza fechas sin zona horaria', async () => {
    const res = await api.post('/api/transfers').send(transferInput({ pickupAt: '2026-12-01 10:00' }));
    expect(res.status).toBe(400);
  });

  it('asigna conductor y vehículo', async () => {
    const t = await createTransfer();
    const res = await api.post(`/api/transfers/${t.id}/assign`).send({ driverId, vehicleId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'assigned', driverId, vehicleId });
  });

  it('rechaza un vehículo sin plazas suficientes', async () => {
    const t = await createTransfer({ passengers: 6 });
    const res = await api.post(`/api/transfers/${t.id}/assign`).send({ driverId, vehicleId });
    expect(res.status).toBe(422);
  });

  it('rechaza asignar recursos inactivos', async () => {
    await api.patch(`/api/drivers/${driverId}`).send({ active: false });
    const t = await createTransfer();
    expect((await api.post(`/api/transfers/${t.id}/assign`).send({ driverId, vehicleId })).status).toBe(422);
  });

  it('detecta solapamientos de horario', async () => {
    const a = await createTransfer({ pickupAt: '2026-12-01T10:00:00Z', durationMinutes: 60 });
    const b = await createTransfer({ pickupAt: '2026-12-01T10:30:00Z' });
    const c = await createTransfer({ pickupAt: '2026-12-01T11:00:00Z' });
    await api.post(`/api/transfers/${a.id}/assign`).send({ driverId, vehicleId });

    const overlap = await api.post(`/api/transfers/${b.id}/assign`).send({ driverId, vehicleId });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.details.conflictingTransferIds).toEqual([a.id]);

    // Empieza justo cuando termina el anterior: no hay solapamiento.
    const adjacent = await api.post(`/api/transfers/${c.id}/assign`).send({ driverId, vehicleId });
    expect(adjacent.status).toBe(200);
  });

  it('los traslados cancelados liberan el horario', async () => {
    const a = await createTransfer();
    const b = await createTransfer();
    await api.post(`/api/transfers/${a.id}/assign`).send({ driverId, vehicleId });
    await api.post(`/api/transfers/${a.id}/status`).send({ status: 'cancelled' });
    expect((await api.post(`/api/transfers/${b.id}/assign`).send({ driverId, vehicleId })).status).toBe(200);
  });

  it('revalida al mover un traslado asignado a un horario ocupado', async () => {
    const a = await createTransfer({ pickupAt: '2026-12-01T10:00:00Z' });
    const b = await createTransfer({ pickupAt: '2026-12-01T14:00:00Z' });
    await api.post(`/api/transfers/${a.id}/assign`).send({ driverId, vehicleId });
    await api.post(`/api/transfers/${b.id}/assign`).send({ driverId, vehicleId });

    const res = await api.patch(`/api/transfers/${b.id}`).send({ pickupAt: '2026-12-01T10:15:00Z' });
    expect(res.status).toBe(409);
    expect((await api.get(`/api/transfers/${b.id}`)).body.pickupAt).toBe('2026-12-01T14:00:00.000Z');
  });

  it('sigue el ciclo de vida completo', async () => {
    const t = await createTransfer();
    const status = (s: string) => api.post(`/api/transfers/${t.id}/status`).send({ status: s });

    expect((await status('in_progress')).status).toBe(422); // sin asignar
    await api.post(`/api/transfers/${t.id}/assign`).send({ driverId, vehicleId });
    expect((await status('in_progress')).body.status).toBe('in_progress');
    expect((await status('cancelled')).status).toBe(422);
    expect((await status('completed')).body.status).toBe('completed');
    expect((await api.patch(`/api/transfers/${t.id}`).send({ notes: 'x' })).status).toBe(422);
    expect((await api.delete(`/api/transfers/${t.id}`)).status).toBe(422);
  });

  it('volver a pendiente libera conductor y vehículo', async () => {
    const t = await createTransfer();
    await api.post(`/api/transfers/${t.id}/assign`).send({ driverId, vehicleId });
    const res = await api.post(`/api/transfers/${t.id}/status`).send({ status: 'pending' });
    expect(res.body).toMatchObject({ status: 'pending', driverId: null, vehicleId: null });
  });

  it('filtra por estado y rango de fechas', async () => {
    await createTransfer({ pickupAt: '2026-12-01T10:00:00Z' });
    const t2 = await createTransfer({ pickupAt: '2026-12-02T10:00:00Z' });
    await api.post(`/api/transfers/${t2.id}/assign`).send({ driverId, vehicleId });

    const byStatus = await api.get('/api/transfers?status=assigned');
    expect(byStatus.body.map((t: { id: number }) => t.id)).toEqual([t2.id]);

    const byDate = await api.get('/api/transfers').query({
      from: '2026-12-01T00:00:00Z',
      to: '2026-12-02T00:00:00Z',
    });
    expect(byDate.body).toHaveLength(1);
  });

  it('responde 400 a JSON mal formado', async () => {
    const res = await api.post('/api/transfers').set('Content-Type', 'application/json').send('{mal');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
