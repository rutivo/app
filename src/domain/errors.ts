/** Errores de dominio: el código HTTP se decide aquí, no en cada ruta. */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;

  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_ERROR';
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT';
}

export class BusinessRuleError extends AppError {
  readonly status = 422;
  readonly code = 'BUSINESS_RULE';
}
