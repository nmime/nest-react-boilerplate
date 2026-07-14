import type {
  HealthDependencyDto,
  HealthIndicatorResult,
  HealthPayloadDto,
  HealthResponse,
  HealthResponseDto,
} from '../dto';
import { sanitizeHealthDetails } from '../util/health-sanitize.util';

export function toHealthResponseDto(appName: string, response: HealthResponse): HealthResponseDto {
  const payload: HealthPayloadDto = {
    app: appName,
    status: response.status,
    uptime: response.uptime,
    timestamp: response.timestamp,
    dependencies: response.checks.map(toHealthDependencyDto),
    checks: response.checks,
  };

  return { data: payload };
}

function toHealthDependencyDto(check: HealthIndicatorResult): HealthDependencyDto {
  const details = sanitizeHealthDetails(check.details);
  return {
    name: check.name,
    status: check.status,
    ...(details ? { details } : {}),
    ...(typeof details?.message === 'string' ? { detail: details.message } : {}),
    required: check.required,
  };
}
