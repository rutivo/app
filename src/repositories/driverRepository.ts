import type { Database } from '../db/database.js';
import type { Driver } from '../domain/models.js';
import type { DriverCreate, DriverUpdate } from '../domain/schemas.js';
import { buildSet, toBit } from './sql.js';

interface DriverRow {
  id: number;
  name: string;
  phone: string;
  license: string;
  active: number;
  created_at: string;
}

const toDriver = (r: DriverRow): Driver => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  license: r.license,
  active: r.active === 1,
  createdAt: r.created_at,
});

export class DriverRepository {
  constructor(private readonly db: Database) {}

  list(): Driver[] {
    const rows = this.db.prepare('SELECT * FROM drivers ORDER BY name').all() as unknown as DriverRow[];
    return rows.map(toDriver);
  }

  findById(id: number): Driver | undefined {
    const row = this.db.prepare('SELECT * FROM drivers WHERE id = ?').get(id) as DriverRow | undefined;
    return row && toDriver(row);
  }

  create(data: DriverCreate): Driver {
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO drivers (name, phone, license, active) VALUES (?, ?, ?, ?)')
      .run(data.name, data.phone, data.license, toBit(data.active));
    return this.findById(Number(lastInsertRowid))!;
  }

  update(id: number, data: DriverUpdate): Driver | undefined {
    const { sql, params } = buildSet(
      data,
      { name: 'name', phone: 'phone', license: 'license', active: 'active' },
      (key, value) => (key === 'active' ? toBit(value as boolean) : (value as string)),
    );
    if (sql) this.db.prepare(`UPDATE drivers SET ${sql} WHERE id = ?`).run(...params, id);
    return this.findById(id);
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM drivers WHERE id = ?').run(id).changes > 0;
  }
}
