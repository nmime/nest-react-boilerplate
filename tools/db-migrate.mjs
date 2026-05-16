#!/usr/bin/env node
import {
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.mjs";
import {
  authMigrationTableName,
  initAuthMigrationOrm,
  migrationNames,
} from "./orm-migration-config.mjs";

loadDotEnv();
const connectionString = postgresConnectionString();

async function main() {
  const orm = await initAuthMigrationOrm();
  try {
    const migrator = orm.migrator;
    const pending = await migrator.getPending();
    const applied = await migrator.up();
    const executed = await migrator.getExecuted();

    console.log(
      JSON.stringify({
        status: "ok",
        database: redactedConnectionString(connectionString),
        migrationsTable: authMigrationTableName,
        pendingBefore: migrationNames(pending),
        executed: migrationNames(applied),
        executedCount: applied.length,
        trackedMigrations: executed.map((migration) => migration.name),
      }),
    );
  } finally {
    await orm.close(true);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
