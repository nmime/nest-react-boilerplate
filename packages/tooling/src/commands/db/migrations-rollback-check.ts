#!/usr/bin/env node
// @ts-nocheck

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: repo-tooling db:migrations:rollback-check");
  console.log("");
  console.log("Starts disposable PostgreSQL through Testcontainers and runs auth migrations up/down/up.");
  console.log("Requires a Docker/Testcontainers-capable environment.");
  process.exit(0);
}

const [{ PostgreSqlContainer }, { initAuthMigrationOrm }] = await Promise.all([
  import("@testcontainers/postgresql"),
  import("./orm-migration-config.ts"),
]);

const started = Date.now();
let container;
let orm;

try {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const env = {
    ...process.env,
    DATABASE_URL: container.getConnectionUri(),
    POSTGRES_SSL: "false",
  };

  orm = await initAuthMigrationOrm(env);
  const migrator = orm.migrator;

  const pendingBefore = await migrator.getPending();
  if (pendingBefore.length === 0) {
    throw new Error("No auth migrations were discovered for rollback check.");
  }

  await migrator.up();
  const executedAfterUp = await migrator.getExecuted();
  if (executedAfterUp.length < pendingBefore.length) {
    throw new Error("Not all auth migrations were executed during up check.");
  }

  await migrator.down({ to: 0 });
  const executedAfterDown = await migrator.getExecuted();
  if (executedAfterDown.length !== 0) {
    throw new Error(
      `Rollback left ${executedAfterDown.length} executed migration(s).`,
    );
  }

  await migrator.up();
  const pendingAfterSecondUp = await migrator.getPending();
  if (pendingAfterSecondUp.length !== 0) {
    throw new Error("Re-applying migrations after rollback left pending migrations.");
  }

  console.log(
    JSON.stringify({
      status: "ok",
      checked: pendingBefore.map((migration) => migration.name),
      durationMs: Date.now() - started,
    }),
  );
} catch (error) {
  console.error("Database migration rollback check failed:");
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  if (orm) {
    await orm.close(true);
  }
  if (container) {
    await container.stop();
  }
}
