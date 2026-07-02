export interface ValidationSuccess<T = unknown> {
  success: true;
  data?: T;
}

export interface ValidationFailure {
  success: false;
  errors: unknown[];
}

export type ValidationResult<T = unknown> =
  ValidationSuccess<T> | ValidationFailure;
