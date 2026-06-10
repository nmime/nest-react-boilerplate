import { describe, expect, it, vi } from "vitest";
import {
  MikroOrmPostgresHealthAdapter,
  PostgresDependencyNotConfiguredError,
  PostgresMigrationsHealthIndicator,
  PostgresMigrationStatusUnsupportedError,
  PostgresReadinessHealthIndicator,
  type PostgresDependencyHealthAdapter,
} from "./postgres.health";

describe("PostgresReadinessHealthIndicator", () => {
  it("runs a bounded read-only readiness query through the adapter", async () => {
    const adapter = adapterStub({
      checkReadiness: vi.fn(() => Promise.resolve(undefined)),
    });
    const health = new PostgresReadinessHealthIndicator(adapter);

    await expect(health.check()).resolves.toEqual({
      name: "postgres",
      status: "ok",
      details: { skipped: false },
    });
    expect(adapter.checkReadiness).toHaveBeenCalledTimes(1);
  });

  it("skips optional apps when Postgres is not configured", async () => {
    await expect(
      new PostgresReadinessHealthIndicator(null).check(),
    ).resolves.toEqual({
      name: "postgres",
      status: "ok",
      details: {
        skipped: true,
        reason: "not_configured",
        message: "Postgres readiness adapter is not configured.",
      },
    });
  });

  it("fails mandatory apps when Postgres is not configured", async () => {
    await expect(
      new PostgresReadinessHealthIndicator(null, { mandatory: true }).check(),
    ).resolves.toEqual({
      name: "postgres",
      status: "error",
      details: {
        skipped: false,
        reason: "not_configured",
        message: "Postgres readiness adapter is not configured.",
      },
    });
  });

  it("redacts connection URLs and secret-like fields from readiness errors", async () => {
    const unsafeMessage = [
      "connect",
      credentialUrl("postgres", "user", "super-secret", "db:5432/app"),
      secretPair("password", "super-secret"),
      secretPair("token", "abc"),
    ].join(" ");
    const adapter = adapterStub({
      checkReadiness: vi.fn(() => Promise.reject(new Error(unsafeMessage))),
    });

    await expect(
      new PostgresReadinessHealthIndicator(adapter).check(),
    ).resolves.toEqual({
      name: "postgres",
      status: "error",
      details: {
        message: [
          "connect",
          redactedUrl("postgres", "db:5432/app"),
          redactedPair("password"),
          redactedPair("token"),
        ].join(" "),
        type: "Error",
      },
    });
  });
});

describe("PostgresMigrationsHealthIndicator", () => {
  it("reports ok when the adapter has no pending migrations", async () => {
    const adapter = adapterStub({
      getPendingMigrations: vi.fn(() => Promise.resolve([])),
    });

    await expect(
      new PostgresMigrationsHealthIndicator(adapter).check(),
    ).resolves.toEqual({
      name: "postgres-migrations",
      status: "ok",
      details: { pending: 0, skipped: false },
    });
    expect(adapter.getPendingMigrations).toHaveBeenCalledTimes(1);
  });

  it("reports pending migrations without leaking migration internals", async () => {
    const adapter = adapterStub({
      getPendingMigrations: vi.fn(() =>
        Promise.resolve([
          { name: "Migration20240601000000" },
          { name: "Migration20240602000000" },
        ]),
      ),
    });

    await expect(
      new PostgresMigrationsHealthIndicator(adapter).check(),
    ).resolves.toEqual({
      name: "postgres-migrations",
      status: "error",
      details: { pending: 2 },
    });
  });

  it("can downgrade pending migrations to degraded for apps that prefer soft readiness", async () => {
    const adapter = adapterStub({
      getPendingMigrations: vi.fn(() => Promise.resolve([{ name: "one" }])),
    });

    await expect(
      new PostgresMigrationsHealthIndicator(adapter, {
        pendingStatus: "degraded",
      }).check(),
    ).resolves.toMatchObject({ status: "degraded", details: { pending: 1 } });
  });

  it("skips optional apps when migration status is unavailable", async () => {
    await expect(
      new PostgresMigrationsHealthIndicator(
        adapterStub({ getPendingMigrations: undefined }),
      ).check(),
    ).resolves.toEqual({
      name: "postgres-migrations",
      status: "ok",
      details: {
        skipped: true,
        reason: "unsupported",
        message:
          "Postgres migration status check is not supported by the configured adapter.",
      },
    });
  });

  it("fails mandatory apps when migration status is unavailable", async () => {
    await expect(
      new PostgresMigrationsHealthIndicator(
        adapterStub({ getPendingMigrations: undefined }),
        { mandatory: true },
      ).check(),
    ).resolves.toEqual({
      name: "postgres-migrations",
      status: "error",
      details: {
        skipped: false,
        reason: "unsupported",
        message:
          "Postgres migration status check is not supported by the configured adapter.",
      },
    });
  });

  it("redacts migration status errors", async () => {
    const unsafeMessage = [
      credentialUrl("postgres", "u", "p", "db/app"),
      secretPair("secret", "value"),
    ].join(" ");
    const adapter = adapterStub({
      getPendingMigrations: vi.fn(() =>
        Promise.reject(new Error(unsafeMessage)),
      ),
    });

    await expect(
      new PostgresMigrationsHealthIndicator(adapter).check(),
    ).resolves.toEqual({
      name: "postgres-migrations",
      status: "error",
      details: {
        message: [
          redactedUrl("postgres", "db/app"),
          redactedPair("secret"),
        ].join(" "),
        type: "Error",
      },
    });
  });
});

describe("MikroOrmPostgresHealthAdapter", () => {
  it("executes select 1 through MikroORM connection", async () => {
    const execute = vi.fn(() => Promise.resolve([{ "?column?": 1 }]));
    const adapter = new MikroOrmPostgresHealthAdapter(
      mikroOrmStub({ execute }) as never,
    );

    await expect(adapter.checkReadiness()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith("select 1");
  });

  it("reads pending migrations through the MikroORM migrator without mutating state", async () => {
    const getPendingMigrations = vi.fn(() =>
      Promise.resolve([
        "Migration20240601000000",
        { file: "Migration20240602000000.ts" },
      ]),
    );
    const adapter = new MikroOrmPostgresHealthAdapter(
      mikroOrmStub({ getPendingMigrations }) as never,
    );

    await expect(adapter.getPendingMigrations()).resolves.toEqual([
      { name: "Migration20240601000000" },
      { name: "Migration20240602000000.ts" },
    ]);
    expect(getPendingMigrations).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when no ORM is configured", async () => {
    const adapter = new MikroOrmPostgresHealthAdapter(null);

    expect(adapter.configured).toBe(false);
    await expect(adapter.checkReadiness()).rejects.toBeInstanceOf(
      PostgresDependencyNotConfiguredError,
    );
  });

  it("throws a clear error when the migrator API is unavailable", async () => {
    const adapter = new MikroOrmPostgresHealthAdapter({
      em: { getConnection: () => ({ execute: vi.fn() }) },
    } as never);

    await expect(adapter.getPendingMigrations()).rejects.toBeInstanceOf(
      PostgresMigrationStatusUnsupportedError,
    );
  });
});

function adapterStub(
  overrides: Partial<PostgresDependencyHealthAdapter> = {},
): PostgresDependencyHealthAdapter {
  return {
    configured: true,
    checkReadiness: vi.fn(() => Promise.resolve(undefined)),
    getPendingMigrations: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

function mikroOrmStub({
  execute = vi.fn(() => Promise.resolve([])),
  getMigrator = vi.fn(() => ({
    getPendingMigrations: vi.fn(() => Promise.resolve([])),
  })),
  getPendingMigrations,
}: {
  execute?: (query: string) => Promise<unknown>;
  getMigrator?: (() => unknown) | undefined;
  getPendingMigrations?: () => Promise<unknown[]>;
} = {}): unknown {
  const orm: {
    em: {
      getConnection: () => { execute: (query: string) => Promise<unknown> };
    };
    getMigrator?: () => unknown;
  } = {
    em: { getConnection: () => ({ execute }) },
  };

  if (getMigrator !== undefined) {
    orm.getMigrator = getPendingMigrations
      ? () => ({ getPendingMigrations })
      : getMigrator;
  }

  return orm;
}

function credentialUrl(
  protocol: string,
  username: string,
  password: string,
  hostAndPath: string,
): string {
  return `${protocol}://${username}:${password}@${hostAndPath}`;
}

function redactedUrl(protocol: string, hostAndPath: string): string {
  return `${protocol}://[redacted]@${hostAndPath}`;
}

function secretPair(key: string, value: string): string {
  return `${key}=${value}`;
}

function redactedPair(key: string): string {
  return `${key}=[redacted]`;
}
