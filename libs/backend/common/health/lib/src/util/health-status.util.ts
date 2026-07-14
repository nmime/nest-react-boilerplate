import type { HealthIndicatorResult, HealthResponse, HealthResponseDto, HealthStatus } from '../dto';

export function hasRequiredReadinessFailure(response: HealthResponse | HealthResponseDto): boolean {
  const checks = 'data' in response ? response.data.checks : response.checks;

  return (checks ?? []).some((check) => check.status === 'error' && check.required !== false);
}

export function resolveHealthStatus(checks: readonly HealthIndicatorResult[]): HealthStatus {
  if (checks.some((check) => check.status === 'error' && check.required !== false)) {
    return 'error';
  }

  if (checks.some((check) => check.status === 'degraded' || (check.status === 'error' && check.required === false))) {
    return 'degraded';
  }

  return 'ok';
}
