import { beforeEach, describe, expect, it } from 'vitest';
import { setup, transferInput } from './helpers.js';

describe('conductores y vehículos', () => {
  let api: ReturnType<typeof setup>['api'];
  beforeEach(() => {
    ({ api } = setup());
  });

  it('crea, lista y actualiza un conductor', async () => {
    const created = await api.post('/api/drivers').send({ name: 'Luis', phone: '600', license: 'B-1' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Luis', active: true });

    const updated = await api.patch(`/api/drivers/${created.body.id}`).send({ active: false });
    expect(updated.body.active).toBe(false);

    const list = await api.get('/api/drivers');
    expect(list.body).toHaveLength(1);
  });

  it('rechaza licencias duplicadas con 409', async () => {
    await api.post('/api/drivers').send({ name: 'A', phone: '1', license: 'X' });
    const dup = await api.post('/api/drivers').send({ name: 'B', phone: '2', license: 'X' });
    expect(dup.status).toBe(409);
  });

  it('valida los datos y devuelve los campos erróneos', async () => {
    const res = await api.post('/api/vehicles').send({ plate: '', model: 'Van', seats: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['plate', 'seats']));
  });

  it('normaliza la matrícula a mayúsculas', async () => {
    const res = await api.post('/api/vehicles').send({ plate: '1234abc', model: 'Van', seats: 8 });
    expect(res.body.plate).toBe('1234ABC');
  });

  it('no borra un conductor con traslados asociados', async () => {
    const d = await api.post('/api/drivers').send({ name: 'L', phone: '1', license: 'L1' });
    const v = await api.post('/api/vehicles').send({ plate: 'P1', model: 'Van', seats: 8 });
    const t = await api.post('/api/transfers').send(transferInput());
    await api.post(`/api/transfers/${t.body.id}/assign`).send({ driverId: d.body.id, vehicleId: v.body.id });

    expect((await api.delete(`/api/drivers/${d.body.id}`)).status).toBe(409);
  });

  it('devuelve 404 para ids inexistentes y 400 para ids no numéricos', async () => {
    expect((await api.get('/api/vehicles/999')).status).toBe(404);
    expect((await api.get('/api/vehicles/abc')).status).toBe(400);
  });
});
