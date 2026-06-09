export type HealthStatus = "ok" | "degraded" | "error";

export interface HealthIndicatorResult {
  name: string;
  status: HealthStatus;
  details?: Record<string, unknown>;
}

export interface HealthIndicator {
  name: string;
  check(): Promise<HealthIndicatorResult> | HealthIndicatorResult;
}

export interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  checks: HealthIndicatorResult[];
}
