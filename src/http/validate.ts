import type { ZodType, ZodTypeDef } from 'zod';
import { ValidationError } from '../domain/errors.js';
import { idParamSchema } from '../domain/schemas.js';

/** Valida `input` con `schema`; lanza ValidationError con los detalles de cada campo. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      'Datos inválidos',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const parseId = (value: unknown): number => parse(idParamSchema, value);
