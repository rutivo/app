import type { SQLInputValue } from 'node:sqlite';

/**
 * Construye la cláusula SET de un UPDATE a partir de un mapa campo→columna
 * fijo, para que ningún nombre de columna provenga de la entrada del usuario.
 */
export function buildSet<T extends object>(
  changes: Partial<T>,
  columns: { [K in keyof T]?: string },
  encode: (key: keyof T, value: unknown) => SQLInputValue = (_k, v) => v as SQLInputValue,
): { sql: string; params: SQLInputValue[] } {
  const parts: string[] = [];
  const params: SQLInputValue[] = [];
  for (const key of Object.keys(changes) as (keyof T)[]) {
    const column = columns[key];
    const value = changes[key];
    if (!column || value === undefined) continue;
    parts.push(`${column} = ?`);
    params.push(encode(key, value));
  }
  return { sql: parts.join(', '), params };
}

export const toBit = (v: boolean): number => (v ? 1 : 0);

/** SQLite devuelve el error de UNIQUE con este texto. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
