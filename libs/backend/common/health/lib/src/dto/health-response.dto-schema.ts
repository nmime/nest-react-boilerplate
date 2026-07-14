export type HealthIndicatorStatus = 'ok' | 'degraded' | 'error' | 'skipped';
export type HealthStatus = Exclude<HealthIndicatorStatus, 'skipped'>;
export type HealthCheckKind = 'health' | 'live' | 'ready' | 'private';

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
  /**
   * Marks the indicator as safe to run during Kubernetes liveness probes.
   * Liveness must only assert that the process itself is alive, so only
   * indicators that touch no external dependency (e.g. the runtime indicator)
   * should opt in. Dependency indicators (Postgres, Redis, NATS, ...) must
   * leave this unset so a transient dependency blip never fails liveness.
   */
  livenessSafe?: boolean;
  check(context?: HealthIndicatorContext): Promise<HealthIndicatorResult> | HealthIndicatorResult;
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
