import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  HealthCheckKind,
  HealthDependencyDto,
  HealthIndicator,
  HealthIndicatorResult,
  HealthIndicatorStatus,
  HealthPayloadDto,
  HealthResponse,
  HealthResponseDto,
  HealthSafeDetails,
  HealthStatus,
} from "./dto";

export interface HealthServiceOptions {
  appName?: string;
  indicators?: readonly HealthIndicator[];
}

const defaultAppName = "app";
const unsafeDetailKeyPattern =
  /(authorization|cookie|credential|passwd|password|private[_-]?key|secret|token)/iu;
const redactedDetailValue = "[redacted]";

@Injectable()
export class HealthService {
  readonly appName: string;
  private readonly indicators: readonly HealthIndicator[];

  constructor(options: HealthServiceOptions | readonly HealthIndicator[] = {}) {
    if (isHealthIndicatorList(options)) {
      this.appName = defaultAppName;
      this.indicators = options;
      return;
    }

    this.appName = options.appName ?? defaultAppName;
    this.indicators = options.indicators ?? [];
  }

  async check(kind: HealthCheckKind = "health"): Promise<HealthResponse> {
    const checks = await this.runIndicators(kind);

    return {
      status: resolveHealthStatus(checks),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async checkEnvelope(
    kind: HealthCheckKind = "health",
  ): Promise<HealthResponseDto> {
    return toHealthResponseDto(this.appName, await this.check(kind));
  }

  async checkReadiness(): Promise<HealthResponseDto> {
    return this.checkEnvelope("ready");
  }

  async checkLiveness(): Promise<HealthResponseDto> {
    return this.checkEnvelope("live");
  }

  async checkPrivate(): Promise<HealthResponseDto> {
    return this.checkEnvelope("private");
  }

  private async runIndicators(
    kind: HealthCheckKind,
  ): Promise<HealthIndicatorResult[]> {
    return Promise.all(
      this.indicators.map(async (indicator) => {
        const startedAt = performance.now();
        try {
          return normalizeIndicatorResult(
            indicator,
            await indicator.check({ appName: this.appName, kind }),
            performance.now() - startedAt,
          );
        } catch {
          return normalizeIndicatorResult(
            indicator,
            {
              name: indicator.name,
              status: "error",
              required: indicator.required,
              details: { message: "Health indicator failed." },
            },
            performance.now() - startedAt,
          );
        }
      }),
    );
  }
}

export function toHealthResponseDto(
  appName: string,
  response: HealthResponse,
): HealthResponseDto {
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

export function hasRequiredReadinessFailure(
  response: HealthResponse | HealthResponseDto,
): boolean {
  const checks = "data" in response ? response.data.checks : response.checks;

  return (checks ?? []).some(
    (check) => check.status === "error" && check.required !== false,
  );
}

export function resolveHealthStatus(
  checks: readonly HealthIndicatorResult[],
): HealthStatus {
  if (
    checks.some((check) => check.status === "error" && check.required !== false)
  ) {
    return "error";
  }

  if (
    checks.some(
      (check) =>
        check.status === "degraded" ||
        (check.status === "error" && check.required === false),
    )
  ) {
    return "degraded";
  }

  return "ok";
}

export function sanitizeHealthDetails(
  details: HealthSafeDetails | undefined,
): HealthSafeDetails | undefined {
  if (!details) {
    return undefined;
  }

  return sanitizeRecord(details);
}

function isHealthIndicatorList(
  options: HealthServiceOptions | readonly HealthIndicator[],
): options is readonly HealthIndicator[] {
  return Array.isArray(options);
}

function normalizeIndicatorResult(
  indicator: HealthIndicator,
  result: HealthIndicatorResult,
  durationMs: number,
): HealthIndicatorResult {
  return {
    ...result,
    name: result.name || indicator.name,
    status: normalizeStatus(result.status),
    required: result.required ?? indicator.required ?? true,
    durationMs: Math.round(durationMs),
    details: sanitizeHealthDetails(result.details),
  };
}

function normalizeStatus(status: HealthIndicatorStatus): HealthIndicatorStatus {
  return status;
}

function toHealthDependencyDto(
  check: HealthIndicatorResult,
): HealthDependencyDto {
  const details = sanitizeHealthDetails(check.details);
  return {
    name: check.name,
    status: check.status,
    ...(details ? { details } : {}),
    ...(typeof details?.message === "string"
      ? { detail: details.message }
      : {}),
    required: check.required,
  };
}

function sanitizeRecord(record: HealthSafeDetails): HealthSafeDetails {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      sanitizeValue(key, value),
    ]),
  );
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (unsafeDetailKeyPattern.test(key)) {
    return redactedDetailValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeRecord(value as HealthSafeDetails);
  }

  return value;
}

export const HealthHttpStatus: Record<HealthStatus, number> = {
  ok: HttpStatus.OK,
  degraded: HttpStatus.OK,
  error: HttpStatus.SERVICE_UNAVAILABLE,
};
