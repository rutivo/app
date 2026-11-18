import type { SQLInputValue } from 'node:sqlite';
import type { Database } from '../db/database.js';
import type { Transfer, TransferStatus } from '../domain/models.js';
import type { TransferCreate, TransferListQuery, TransferUpdate } from '../domain/schemas.js';
import { buildSet } from './sql.js';

interface TransferRow {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  pickup_location: string;
  dropoff_location: string;
  pickup_at: string;
  duration_minutes: number;
  passengers: number;
  price_cents: number;
  notes: string | null;
  status: TransferStatus;
  driver_id: number | null;
  vehicle_id: number | null;
  created_at: string;
  updated_at: string;
}

const toTransfer = (r: TransferRow): Transfer => ({
  id: r.id,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  customerEmail: r.customer_email,
  pickupLocation: r.pickup_location,
  dropoffLocation: r.dropoff_location,
  pickupAt: r.pickup_at,
  durationMinutes: r.duration_minutes,
  passengers: r.passengers,
  priceCents: r.price_cents,
  notes: r.notes,
  status: r.status,
  driverId: r.driver_id,
  vehicleId: r.vehicle_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const COLUMNS = {
  customerName: 'customer_name',
  customerPhone: 'customer_phone',
  customerEmail: 'customer_email',
  pickupLocation: 'pickup_location',
  dropoffLocation: 'dropoff_location',
  pickupAt: 'pickup_at',
  durationMinutes: 'duration_minutes',
  passengers: 'passengers',
  priceCents: 'price_cents',
  notes: 'notes',
  status: 'status',
  driverId: 'driver_id',
  vehicleId: 'vehicle_id',
} as const satisfies Record<string, string>;

/** Campos que el repositorio permite modificar (incluye asignación y estado). */
export type TransferPatch = TransferUpdate &
  Partial<Pick<Transfer, 'status' | 'driverId' | 'vehicleId'>>;

/** Estados en los que un servicio ocupa conductor y vehículo. */
const BLOCKING_STATUSES: readonly TransferStatus[] = ['assigned', 'in_progress'];

export class TransferRepository {
  constructor(private readonly db: Database) {}

  list(query: TransferListQuery = {}): Transfer[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (query.status) {
      where.push('status = ?');
      params.push(query.status);
    }
    if (query.from) {
      where.push('pickup_at >= ?');
      params.push(query.from);
    }
    if (query.to) {
      where.push('pickup_at < ?');
      params.push(query.to);
    }
    if (query.driverId) {
      where.push('driver_id = ?');
      params.push(query.driverId);
    }
    const sql = `SELECT * FROM transfers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pickup_at`;
    return (this.db.prepare(sql).all(...params) as unknown as TransferRow[]).map(toTransfer);
  }

  findById(id: number): Transfer | undefined {
    const row = this.db.prepare('SELECT * FROM transfers WHERE id = ?').get(id) as TransferRow | undefined;
    return row && toTransfer(row);
  }

  create(data: TransferCreate): Transfer {
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO transfers (customer_name, customer_phone, customer_email, pickup_location,
           dropoff_location, pickup_at, duration_minutes, passengers, price_cents, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.customerName,
        data.customerPhone,
        data.customerEmail,
        data.pickupLocation,
        data.dropoffLocation,
        data.pickupAt,
        data.durationMinutes,
        data.passengers,
        data.priceCents,
        data.notes,
      );
    return this.findById(Number(lastInsertRowid))!;
  }

  update(id: number, patch: TransferPatch): Transfer | undefined {
    const { sql, params } = buildSet<TransferPatch>(patch, COLUMNS);
    if (sql) {
      this.db
        .prepare(`UPDATE transfers SET ${sql}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
        .run(...params, id);
    }
    return this.findById(id);
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM transfers WHERE id = ?').run(id).changes > 0;
  }

  /**
   * Servicios activos que se solapan con [start, end) y usan el conductor o
   * el vehículo indicados. Excluye `excludeId` (el propio servicio).
   */
  findOverlapping(params: {
    start: string;
    end: string;
    driverId: number;
    vehicleId: number;
    excludeId: number;
  }): Transfer[] {
    const placeholders = BLOCKING_STATUSES.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM transfers
          WHERE id <> ?
            AND status IN (${placeholders})
            AND (driver_id = ? OR vehicle_id = ?)
            AND pickup_at < ?
            AND strftime('%Y-%m-%dT%H:%M:%fZ', pickup_at, '+' || duration_minutes || ' minutes') > ?`,
      )
      .all(
        params.excludeId,
        ...BLOCKING_STATUSES,
        params.driverId,
        params.vehicleId,
        params.end,
        params.start,
      ) as unknown as TransferRow[];
    return rows.map(toTransfer);
  }

  countByReference(column: 'driver_id' | 'vehicle_id', id: number): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM transfers WHERE ${column} = ?`)
      .get(id) as { n: number };
    return row.n;
  }
}
