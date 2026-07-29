import { assertLocalPostgresDatabase, postgresConnectionString, redactedPostgresConnectionString } from './postgres-environment.ts';
import { authMigrationTableName, initAuthMigrationOrm, migrationNames } from './orm-migration-config.ts';

export async function resetPostgresDatabase(): Promise<void> {
  const connectionString = postgresConnectionString();
  assertLocalPostgresDatabase(connectionString);
  const orm = await initAuthMigrationOrm();
  try {
    await orm.schema.drop({ dropForeignKeys: true, dropMigrationsTable: true, wrap: true });
    const applied = await orm.migrator.up();
    console.log(
      JSON.stringify({
        status: 'reset',
        database: redactedPostgresConnectionString(connectionString),
        droppedSchema: true,
        migrationsTable: authMigrationTableName,
        executed: migrationNames(applied),
        executedCount: applied.length,
      }),
    );
  } finally {
    await orm.close(true);
  }
}
