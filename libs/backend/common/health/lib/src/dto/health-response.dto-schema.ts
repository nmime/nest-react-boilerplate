export type HealthIndicatorStatus = "ok" | "degraded" | "error" | "skipped";
export type HealthStatus = Exclude<HealthIndicatorStatus, "skipped">;
export type HealthCheckKind = "health" | "live" | "ready" | "private";

export interface HealthIndicatorContext {
  appName: string;
  kind: HealthCheckKind;
}

export interface HealthSafeDetails {
  [key: string]: unknown;
}

export interface HealthIndicatorResult {
  name: string;
  status: HealthIndicatorStatus;
  details?: HealthSafeDetails;
  required?: boolean;
  durationMs?: number;
}

export interface HealthIndicator {
  name: string;
  required?: boolean;
  check(
    context?: HealthIndicatorContext,
  ): Promise<HealthIndicatorResult> | HealthIndicatorResult;
}

export interface HealthDependencyDto {
  name: string;
  status: HealthIndicatorStatus;
  detail?: string;
  details?: HealthSafeDetails;
  required?: boolean;
}

export interface HealthPayloadDto {
  app: string;
  status: HealthStatus;
  uptime?: number;
  timestamp?: string;
  dependencies?: HealthDependencyDto[];
  checks?: HealthIndicatorResult[];
}

export interface HealthResponseDto {
  data: HealthPayloadDto;
}

export interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  checks: HealthIndicatorResult[];
}
