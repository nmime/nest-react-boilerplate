// @ts-nocheck
import { postgresConnectionString, redactedPostgresConnectionString } from './postgres-environment.ts';
import { applyBetterAuthSchema } from './better-auth-schema.ts';
import { authMigrationTableName, initAuthMigrationOrm, migrationNames } from './orm-migration-config.ts';

export async function migratePostgresDatabase(): Promise<void> {
  const connectionString = postgresConnectionString();
  const report = {
    status: 'running',
    database: redactedPostgresConnectionString(connectionString),
    betterAuth: { created: [], skipped: [] },
    mikroOrm: { name: authMigrationTableName, pendingBefore: [], applied: [], executedCount: 0, trackedMigrations: [] },
  };

  console.log('[migrate] Step 1/2: Applying Better-Auth core schema...');
  const schemaResult = await applyBetterAuthSchema({ connectionString });
  report.betterAuth = schemaResult;
  console.log(
    `[migrate] Better-Auth schema: ${schemaResult.created.length} created, ${schemaResult.skipped.length} skipped`,
  );

  console.log('[migrate] Step 2/2: Applying MikroORM auth migrations...');
  const orm = await initAuthMigrationOrm();
  try {
    const pending = await orm.migrator.getPending();
    report.mikroOrm.pendingBefore = migrationNames(pending);
    const applied = await orm.migrator.up();
    const executed = await orm.migrator.getExecuted();
    report.mikroOrm.applied = migrationNames(applied);
    report.mikroOrm.executedCount = applied.length;
    report.mikroOrm.trackedMigrations = executed.map((migration) => migration.name);
    console.log(`[migrate] MikroORM: ${applied.length} applied, ${executed.length} total tracked`);
  } finally {
    await orm.close(true);
  }

  report.status = 'ok';
  console.log(
    JSON.stringify({
      status: report.status,
      provider: 'postgres',
      database: report.database,
      betterAuthCreated: report.betterAuth.created.length,
      betterAuthSkipped: report.betterAuth.skipped.length,
      mikroOrmApplied: report.mikroOrm.applied.length,
      mikroOrmTotalTracked: report.mikroOrm.trackedMigrations.length,
    }),
  );
  console.log('[migrate] All migrations completed successfully.');
}
