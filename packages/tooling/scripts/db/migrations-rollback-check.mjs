#!/usr/bin/env node
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { initAuthMigrationOrm } from "./orm-migration-config.mjs";

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
  const migrator = orm.getMigrator();

  const pendingBefore = await migrator.getPendingMigrations();
  if (pendingBefore.length === 0) {
    throw new Error("No auth migrations were discovered for rollback check.");
  }

  await migrator.up();
  const executedAfterUp = await migrator.getExecutedMigrations();
  if (executedAfterUp.length < pendingBefore.length) {
    throw new Error("Not all auth migrations were executed during up check.");
  }

  await migrator.down({ to: 0 });
  const executedAfterDown = await migrator.getExecutedMigrations();
  if (executedAfterDown.length !== 0) {
    throw new Error(
      `Rollback left ${executedAfterDown.length} executed migration(s).`,
    );
  }

  await migrator.up();
  const pendingAfterSecondUp = await migrator.getPendingMigrations();
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
