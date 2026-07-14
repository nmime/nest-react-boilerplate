import { Injectable } from '@nestjs/common';
import type {
  HealthCheckKind,
  HealthIndicator,
  HealthIndicatorResult,
  HealthIndicatorStatus,
  HealthResponse,
  HealthResponseDto,
} from './dto';
import { toHealthResponseDto } from './mapper';
import { resolveHealthStatus } from './util/health-status.util';
import { sanitizeHealthDetails } from './util/health-sanitize.util';

export interface HealthServiceOptions {
  appName?: string;
  indicators?: readonly HealthIndicator[];
}

const defaultAppName = 'app';

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

  async check(kind: HealthCheckKind = 'health'): Promise<HealthResponse> {
    const checks = await this.runIndicators(kind);

    return {
      status: resolveHealthStatus(checks),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  async checkEnvelope(kind: HealthCheckKind = 'health'): Promise<HealthResponseDto> {
    return toHealthResponseDto(this.appName, await this.check(kind));
  }

  async checkReadiness(): Promise<HealthResponseDto> {
    return this.checkEnvelope('ready');
  }

  async checkLiveness(): Promise<HealthResponseDto> {
    return this.checkEnvelope('live');
  }

  async checkPrivate(): Promise<HealthResponseDto> {
    return this.checkEnvelope('private');
  }

  private async runIndicators(kind: HealthCheckKind): Promise<HealthIndicatorResult[]> {
    // Liveness must only prove the process is alive: run no dependency
    // indicators, only those explicitly marked liveness-safe. Otherwise a
    // transient dependency blip would fail liveness and Kubernetes would
    // restart an otherwise healthy pod. Readiness/health run every indicator.
    const indicators =
      kind === 'live' ? this.indicators.filter((indicator) => indicator.livenessSafe === true) : this.indicators;

    return Promise.all(
      indicators.map(async (indicator) => {
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
              status: 'error',
              required: indicator.required,
              details: { message: 'Health indicator failed.' },
            },
            performance.now() - startedAt,
          );
        }
      }),
    );
  }
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
