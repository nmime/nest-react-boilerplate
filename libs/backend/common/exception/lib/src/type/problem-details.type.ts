export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  localizedDetail?: string;
  info?: Record<string, unknown>;
  errors?: unknown;
  [extension: string]: unknown;
}
