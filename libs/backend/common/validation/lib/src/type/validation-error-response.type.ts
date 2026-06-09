export interface ValidationErrorResponse {
  property: string;
  constraints?: Record<string, string>;
  children?: ValidationErrorResponse[];
}
