import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

// Se carga con require para que herramientas que no conocen `node:sqlite`
// (p. ej. Vite en los tests) no intenten resolverlo como paquete.
const { DatabaseSync: SqliteDatabase } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

export type Database = DatabaseSync;

/**
 * Migraciones ordenadas. Cada una se aplica una sola vez y su índice queda
 * registrado en `PRAGMA user_version`. Nunca modifiques una migración ya
 * publicada: añade una nueva al final.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE drivers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    license     TEXT    NOT NULL UNIQUE,
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE vehicles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plate       TEXT    NOT NULL UNIQUE,
    model       TEXT    NOT NULL,
    seats       INTEGER NOT NULL CHECK (seats > 0),
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE transfers (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name      TEXT    NOT NULL,
    customer_phone     TEXT    NOT NULL,
    customer_email     TEXT,
    pickup_location    TEXT    NOT NULL,
    dropoff_location   TEXT    NOT NULL,
    pickup_at          TEXT    NOT NULL,
    duration_minutes   INTEGER NOT NULL CHECK (duration_minutes > 0),
    passengers         INTEGER NOT NULL CHECK (passengers > 0),
    price_cents        INTEGER NOT NULL CHECK (price_cents >= 0),
    notes              TEXT,
    status             TEXT    NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','assigned','in_progress','completed','cancelled')),
    driver_id          INTEGER REFERENCES drivers(id),
    vehicle_id         INTEGER REFERENCES vehicles(id),
    created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX idx_transfers_pickup_at ON transfers(pickup_at);
  CREATE INDEX idx_transfers_driver    ON transfers(driver_id);
  CREATE INDEX idx_transfers_vehicle   ON transfers(vehicle_id);
  `,
];

export function openDatabase(path: string): Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new SqliteDatabase(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Ejecuta `fn` dentro de una transacción; hace rollback si lanza. */
export function inTransaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
