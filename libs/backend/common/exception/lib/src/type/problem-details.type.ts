export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  localizedDetail?: string;
  errors?: unknown;
  [extension: string]: unknown;
}
