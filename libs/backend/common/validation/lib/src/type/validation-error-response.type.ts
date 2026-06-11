export interface ValidationErrorResponse {
  property: string;
  constraints?: Record<string, string>;
  message?: string;
  detail?: string;
  pointer?: string;
  children?: ValidationErrorResponse[];
}
