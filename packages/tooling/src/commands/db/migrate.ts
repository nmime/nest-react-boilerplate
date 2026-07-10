#!/usr/bin/env node
// @ts-nocheck
/**
 * Unified auth migration runner.
 *
 * Applies both MikroORM auth migrations and Better-Auth core schema
 * in a single idempotent pass:
 *   1. Better-Auth core schema (user, session, account, verification) — idempotent DDL
 *   2. MikroORM auth migrations (auth_users, auth_refresh_tokens, etc.) — tracked in mikro_orm_migrations
 *
 * Safe to run on:
 *   - Fresh database: creates everything from scratch
 *   - Existing database with partial schema: skips what exists, creates what's missing
 *   - Already-migrated database: no-op, all items skipped
 */
import { loadDotEnv, postgresConnectionString, redactedConnectionString } from "./env-loader.ts";
import { authMigrationTableName, initAuthMigrationOrm, migrationNames } from "./orm-migration-config.ts";
import { applyBetterAuthSchema } from "./better-auth-schema.ts";

loadDotEnv();
const connectionString = postgresConnectionString();

async function main() {
  const report = {
    status: "running",
    database: redactedConnectionString(connectionString),
    betterAuth: { created: [], skipped: [] },
    mikroOrm: { name: authMigrationTableName, pendingBefore: [], applied: [], executedCount: 0, trackedMigrations: [] },
  };

  try {
    // Step 1: Better-Auth core schema (idempotent, transactional)
    console.log("[migrate] Step 1/2: Applying Better-Auth core schema...");
    const schemaResult = await applyBetterAuthSchema({ connectionString });
    report.betterAuth = schemaResult;
    console.log(`[migrate] Better-Auth schema: ${schemaResult.created.length} created, ${schemaResult.skipped.length} skipped`);
  } catch (err) {
    console.error("[migrate] Better-Auth schema failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Step 2: MikroORM auth migrations
  console.log("[migrate] Step 2/2: Applying MikroORM auth migrations...");
  const orm = await initAuthMigrationOrm();
  try {
    const migrator = orm.migrator;
    const pending = await migrator.getPending();
    report.mikroOrm.pendingBefore = migrationNames(pending);
    const applied = await migrator.up();
    const executed = await migrator.getExecuted();
    report.mikroOrm.applied = migrationNames(applied);
    report.mikroOrm.executedCount = applied.length;
    report.mikroOrm.trackedMigrations = executed.map((migration) => migration.name);
    console.log(`[migrate] MikroORM: ${applied.length} applied, ${executed.length} total tracked`);
  } catch (err) {
    console.error("[migrate] MikroORM migrations failed:", err instanceof Error ? err.message : String(err));
    await orm.close(true);
    process.exit(1);
  } finally {
    await orm.close(true);
  }

  report.status = "ok";
  console.log(JSON.stringify({
    status: report.status,
    database: report.database,
    betterAuthCreated: report.betterAuth.created.length,
    betterAuthSkipped: report.betterAuth.skipped.length,
    mikroOrmApplied: report.mikroOrm.applied.length,
    mikroOrmTotalTracked: report.mikroOrm.trackedMigrations.length,
  }));
  console.log("[migrate] All migrations completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
