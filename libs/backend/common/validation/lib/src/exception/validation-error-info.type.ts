/**
 * Typed validation error info — exposed in response `info.errors`.
 */
export interface ValidationErrorInfo {
  property: string;
  constraints: Record<string, string>;
  message?: string;
  detail?: string;
  pointer?: string;
}

/**
 * Aggregate validation error info — what goes into `info` for validation failures.
 */
export interface ClientDataValidationInfo {
  errors: ValidationErrorInfo[];
}
