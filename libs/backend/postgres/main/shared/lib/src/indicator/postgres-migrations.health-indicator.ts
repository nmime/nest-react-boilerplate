import { Inject, Injectable, Optional } from '@nestjs/common';
import type { HealthIndicatorResult, HealthStatus } from '@app/backend-common-health';
import {
  DefaultPostgresMigrationsName,
  DefaultTimeoutMs,
  PostgresHealthAdapter,
  PostgresMigrationsHealthOptions,
} from '../const';
import { PostgresDependencyNotConfiguredError, PostgresMigrationStatusUnsupportedError } from '../exception';
import type { PostgresDependencyHealthAdapter, PostgresMigrationsHealthIndicatorOptions } from '../type';
import { dependencyError, dependencyUnavailableResult, isConfigured, withTimeout } from '../util';

@Injectable()
export class PostgresMigrationsHealthIndicator {
  readonly name: string;
  private readonly mandatory: boolean;
  private readonly timeoutMs: number;
  private readonly pendingStatus: Extract<HealthStatus, 'degraded' | 'error'>;

  constructor(
    @Optional()
    @Inject(PostgresHealthAdapter)
    private readonly adapter?: PostgresDependencyHealthAdapter | null,
    @Optional()
    @Inject(PostgresMigrationsHealthOptions)
    options: PostgresMigrationsHealthIndicatorOptions = {},
  ) {
    this.name = options.name ?? DefaultPostgresMigrationsName;
    this.mandatory = options.mandatory ?? false;
    this.timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
    this.pendingStatus = options.pendingStatus ?? 'error';
  }

  async check(): Promise<HealthIndicatorResult> {
    if (!isConfigured(this.adapter)) {
      return dependencyUnavailableResult({
        name: this.name,
        mandatory: this.mandatory,
        reason: 'not_configured',
        message: 'Postgres migrations adapter is not configured.',
      });
    }

    if (!this.adapter.getPendingMigrations) {
      return this.unsupported();
    }

    try {
      const pendingMigrations = await withTimeout(
        this.adapter.getPendingMigrations(),
        this.timeoutMs,
        'Postgres migration status check timed out.',
      );
      const pendingCount = pendingMigrations.length;

      if (pendingCount > 0) {
        return {
          name: this.name,
          status: this.pendingStatus,
          details: { pending: pendingCount },
        };
      }

      return {
        name: this.name,
        status: 'ok',
        details: { pending: 0, skipped: false },
      };
    } catch (error) {
      if (error instanceof PostgresDependencyNotConfiguredError) {
        return dependencyUnavailableResult({
          name: this.name,
          mandatory: this.mandatory,
          reason: 'not_configured',
          message: error.message,
        });
      }

      if (error instanceof PostgresMigrationStatusUnsupportedError) {
        return this.unsupported();
      }

      return dependencyError(this.name, error);
    }
  }

  private unsupported(): HealthIndicatorResult {
    return dependencyUnavailableResult({
      name: this.name,
      mandatory: this.mandatory,
      reason: 'unsupported',
      message: 'Postgres migration status check is not supported by the configured adapter.',
    });
  }
}
