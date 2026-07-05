export interface ProblemDetailsInput {
  title: string;
  status: number;
  code?: string;
  detail?: string;
  type?: string;
  instance?: string;
  extensions?: Record<string, unknown>;
}
