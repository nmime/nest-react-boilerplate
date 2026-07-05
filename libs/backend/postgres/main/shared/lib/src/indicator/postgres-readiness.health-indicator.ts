import { Inject, Injectable, Optional } from "@nestjs/common";
import type { HealthIndicatorResult } from "@app/backend-common-health";
import {
  DefaultPostgresReadinessName,
  DefaultTimeoutMs,
  PostgresHealthAdapter,
  PostgresReadinessHealthOptions,
} from "../const";
import { PostgresDependencyNotConfiguredError } from "../exception";
import type {
  PostgresDependencyHealthAdapter,
  PostgresHealthIndicatorOptions,
} from "../type";
import {
  dependencyError,
  dependencyUnavailableResult,
  isConfigured,
  withTimeout,
} from "../util";

@Injectable()
export class PostgresReadinessHealthIndicator {
  readonly name: string;
  private readonly mandatory: boolean;
  private readonly timeoutMs: number;

  constructor(
    @Optional()
    @Inject(PostgresHealthAdapter)
    private readonly adapter?: PostgresDependencyHealthAdapter | null,
    @Optional()
    @Inject(PostgresReadinessHealthOptions)
    options: PostgresHealthIndicatorOptions = {},
  ) {
    this.name = options.name ?? DefaultPostgresReadinessName;
    this.mandatory = options.mandatory ?? false;
    this.timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  }

  async check(): Promise<HealthIndicatorResult> {
    if (!isConfigured(this.adapter)) {
      return this.notConfigured(
        "Postgres readiness adapter is not configured.",
      );
    }

    try {
      await withTimeout(
        this.adapter.checkReadiness(),
        this.timeoutMs,
        "Postgres readiness check timed out.",
      );

      return {
        name: this.name,
        status: "ok",
        details: { skipped: false },
      };
    } catch (error) {
      if (error instanceof PostgresDependencyNotConfiguredError) {
        return this.notConfigured(error.message);
      }

      return dependencyError(this.name, error);
    }
  }

  private notConfigured(message: string): HealthIndicatorResult {
    return dependencyUnavailableResult({
      name: this.name,
      mandatory: this.mandatory,
      reason: "not_configured",
      message,
    });
  }
}
