/**
 * Public validation issue in the problem type's `errors` extension.
 */
export interface ValidationErrorInfo {
  detail: string;
  pointer: string;
}

/**
 * Aggregate validation extension.
 */
export interface ClientDataValidationInfo {
  errors: ValidationErrorInfo[];
}
