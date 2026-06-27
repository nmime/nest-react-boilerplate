import { MikroORM } from "@mikro-orm/core";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type {
  HealthIndicatorResult,
  HealthStatus,
} from "@app/backend/common/health";

export const POSTGRES_HEALTH_ADAPTER = "POSTGRES_HEALTH_ADAPTER";
export const POSTGRES_READINESS_HEALTH_OPTIONS =
  "POSTGRES_READINESS_HEALTH_OPTIONS";
export const POSTGRES_MIGRATIONS_HEALTH_OPTIONS =
  "POSTGRES_MIGRATIONS_HEALTH_OPTIONS";

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

const DefaultTimeoutMs = 2_000;
const DefaultPostgresReadinessName = "postgres";
const DefaultPostgresMigrationsName = "postgres-migrations";

@Injectable()
export class MikroOrmPostgresHealthAdapter implements PostgresDependencyHealthAdapter {
  constructor(@Optional() private readonly orm?: MikroORM | null) {}

  get configured(): boolean {
    return Boolean(this.orm);
  }

  async checkReadiness(): Promise<void> {
    const orm = this.getConfiguredOrm();

    await orm.em.getConnection().execute("select 1");
  }

  async getPendingMigrations(): Promise<readonly PostgresPendingMigration[]> {
    const orm = this.getConfiguredOrm() as unknown as {
      getMigrator?: () => unknown;
    };
    const migrator = orm.getMigrator?.();
    if (!migrator) {
      throw new PostgresMigrationStatusUnsupportedError();
    }

    const pendingMigrationsReader = migrator as {
      getPendingMigrations?: () =>
        | Promise<readonly unknown[]>
        | readonly unknown[];
    };
    if (!pendingMigrationsReader.getPendingMigrations) {
      throw new PostgresMigrationStatusUnsupportedError();
    }

    const pendingMigrations =
      await pendingMigrationsReader.getPendingMigrations();

    return pendingMigrations.map((migration) =>
      normalizePendingMigration(migration),
    );
  }

  private getConfiguredOrm(): MikroORM {
    if (!this.orm) {
      throw new PostgresDependencyNotConfiguredError();
    }

    return this.orm;
  }
}

@Injectable()
export class PostgresReadinessHealthIndicator {
  readonly name: string;
  private readonly mandatory: boolean;
  private readonly timeoutMs: number;

  constructor(
    @Optional()
    @Inject(POSTGRES_HEALTH_ADAPTER)
    private readonly adapter?: PostgresDependencyHealthAdapter | null,
    @Optional()
    @Inject(POSTGRES_READINESS_HEALTH_OPTIONS)
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

@Injectable()
export class PostgresMigrationsHealthIndicator {
  readonly name: string;
  private readonly mandatory: boolean;
  private readonly timeoutMs: number;
  private readonly pendingStatus: Extract<HealthStatus, "degraded" | "error">;

  constructor(
    @Optional()
    @Inject(POSTGRES_HEALTH_ADAPTER)
    private readonly adapter?: PostgresDependencyHealthAdapter | null,
    @Optional()
    @Inject(POSTGRES_MIGRATIONS_HEALTH_OPTIONS)
    options: PostgresMigrationsHealthIndicatorOptions = {},
  ) {
    this.name = options.name ?? DefaultPostgresMigrationsName;
    this.mandatory = options.mandatory ?? false;
    this.timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
    this.pendingStatus = options.pendingStatus ?? "error";
  }

  async check(): Promise<HealthIndicatorResult> {
    if (!isConfigured(this.adapter)) {
      return dependencyUnavailableResult({
        name: this.name,
        mandatory: this.mandatory,
        reason: "not_configured",
        message: "Postgres migrations adapter is not configured.",
      });
    }

    if (!this.adapter.getPendingMigrations) {
      return this.unsupported();
    }

    try {
      const pendingMigrations = await withTimeout(
        this.adapter.getPendingMigrations(),
        this.timeoutMs,
        "Postgres migration status check timed out.",
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
        status: "ok",
        details: { pending: 0, skipped: false },
      };
    } catch (error) {
      if (error instanceof PostgresDependencyNotConfiguredError) {
        return dependencyUnavailableResult({
          name: this.name,
          mandatory: this.mandatory,
          reason: "not_configured",
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
      reason: "unsupported",
      message:
        "Postgres migration status check is not supported by the configured adapter.",
    });
  }
}

export class PostgresDependencyNotConfiguredError extends Error {
  constructor() {
    super("Postgres dependency is not configured.");
    this.name = "PostgresDependencyNotConfiguredError";
  }
}

export class PostgresMigrationStatusUnsupportedError extends Error {
  constructor() {
    super("Postgres migration status check is not supported.");
    this.name = "PostgresMigrationStatusUnsupportedError";
  }
}

function isConfigured(
  adapter: PostgresDependencyHealthAdapter | null | undefined,
): adapter is PostgresDependencyHealthAdapter {
  return adapter != null && adapter.configured !== false;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

interface DependencyUnavailableResultOptions {
  name: string;
  mandatory: boolean;
  reason: "not_configured" | "unsupported";
  message: string;
}

function dependencyUnavailableResult({
  name,
  mandatory,
  reason,
  message,
}: DependencyUnavailableResultOptions): HealthIndicatorResult {
  return {
    name,
    status: mandatory ? "error" : "ok",
    details: {
      skipped: !mandatory,
      reason,
      message,
    },
  };
}

function dependencyError(name: string, error: unknown): HealthIndicatorResult {
  return {
    name,
    status: "error",
    details: safeErrorDetails(error),
  };
}

function safeErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: redactDependencyDetail(error.message),
      type: error.name,
    };
  }

  return { message: redactDependencyDetail(String(error)) };
}

const connectionCredentialPattern = new RegExp(
  ["([a-z][a-z0-9+.-]*://)", "([^\\s/@:]+)", ":", "([^\\s/@]+)", "@"].join(""),
  "giu",
);
const secretAssignmentPattern =
  /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^\s,;]+)/giu;

function redactDependencyDetail(value: string): string {
  return value
    .replace(connectionCredentialPattern, "$1[redacted]@")
    .replace(secretAssignmentPattern, "$1=[redacted]");
}

function normalizePendingMigration(
  migration: unknown,
): PostgresPendingMigration {
  if (typeof migration === "string") {
    return { name: migration };
  }

  if (!migration || typeof migration !== "object") {
    return {};
  }

  const record = migration as Record<string, unknown>;
  const name = firstString(
    record.name,
    record.file,
    record.path,
    record.migration,
  );

  return name ? { name } : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string");
}
