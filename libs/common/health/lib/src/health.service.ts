import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  HealthIndicator,
  HealthIndicatorResult,
  HealthResponse,
  HealthStatus,
} from "./dto";

@Injectable()
export class HealthService {
  constructor(private readonly indicators: HealthIndicator[] = []) {}

  async check(): Promise<HealthResponse> {
    const checks = await Promise.all(
      this.indicators.map(async (indicator) => {
        try {
          return await indicator.check();
        } catch (error) {
          return {
            name: indicator.name,
            status: "error" as const,
            details: {
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }),
    );

    return {
      status: resolveHealthStatus(checks),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}

function resolveHealthStatus(
  checks: readonly HealthIndicatorResult[],
): HealthStatus {
  if (checks.some((check) => check.status === "error")) {
    return "error";
  }

  if (checks.some((check) => check.status === "degraded")) {
    return "degraded";
  }

  return "ok";
}

export const HealthHttpStatus: Record<HealthStatus, number> = {
  ok: HttpStatus.OK,
  degraded: HttpStatus.OK,
  error: HttpStatus.SERVICE_UNAVAILABLE,
};
