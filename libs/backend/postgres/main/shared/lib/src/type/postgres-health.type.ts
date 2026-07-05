import type { HealthStatus } from "@app/backend-common-health";

export interface PostgresHealthIndicatorOptions {
  name?: string;
  mandatory?: boolean;
  timeoutMs?: number;
}

export interface PostgresMigrationsHealthIndicatorOptions extends PostgresHealthIndicatorOptions {
  pendingStatus?: Extract<HealthStatus, "degraded" | "error">;
}

export interface PostgresPendingMigration {
  name?: string;
}

export interface PostgresDependencyHealthAdapter {
  readonly configured?: boolean;
  checkReadiness(): Promise<void>;
  getPendingMigrations?(): Promise<readonly PostgresPendingMigration[]>;
}
