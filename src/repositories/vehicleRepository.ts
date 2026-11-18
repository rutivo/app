import type { Database } from '../db/database.js';
import type { Vehicle } from '../domain/models.js';
import type { VehicleCreate, VehicleUpdate } from '../domain/schemas.js';
import { buildSet, toBit } from './sql.js';

interface VehicleRow {
  id: number;
  plate: string;
  model: string;
  seats: number;
  active: number;
  created_at: string;
}

const toVehicle = (r: VehicleRow): Vehicle => ({
  id: r.id,
  plate: r.plate,
  model: r.model,
  seats: r.seats,
  active: r.active === 1,
  createdAt: r.created_at,
});

export class VehicleRepository {
  constructor(private readonly db: Database) {}

  list(): Vehicle[] {
    const rows = this.db.prepare('SELECT * FROM vehicles ORDER BY plate').all() as unknown as VehicleRow[];
    return rows.map(toVehicle);
  }

  findById(id: number): Vehicle | undefined {
    const row = this.db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as VehicleRow | undefined;
    return row && toVehicle(row);
  }

  create(data: VehicleCreate): Vehicle {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO vehicles (plate, model, seats, active) VALUES (?, ?, ?, ?)')
      .run(data.plate, data.model, data.seats, toBit(data.active));
    return this.findById(Number(lastInsertRowid))!;
  }

  update(id: number, data: VehicleUpdate): Vehicle | undefined {
    const { sql, params } = buildSet(
      data,
      { plate: 'plate', model: 'model', seats: 'seats', active: 'active' },
      (key, value) => (key === 'active' ? toBit(value as boolean) : (value as string | number)),
    );
    if (sql) this.db.prepare(`UPDATE vehicles SET ${sql} WHERE id = ?`).run(...params, id);
    return this.findById(id);
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM vehicles WHERE id = ?').run(id).changes > 0;
  }
}
