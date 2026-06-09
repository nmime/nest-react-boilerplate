#!/usr/bin/env node
// @ts-nocheck
import { assertLocalDevelopmentDatabase, loadDotEnv, postgresConnectionString, redactedConnectionString } from "./env-loader.ts"; import { authMigrationTableName, initAuthMigrationOrm, migrationNames } from "./orm-migration-config.ts";
loadDotEnv(); const connectionString = postgresConnectionString();
async function main() { assertLocalDevelopmentDatabase(connectionString); const orm = await initAuthMigrationOrm(); try { await orm.schema.drop({ dropForeignKeys: true, dropMigrationsTable: true, wrap: true }); const applied = await orm.migrator.up(); console.log(JSON.stringify({ status: "reset", database: redactedConnectionString(connectionString), droppedSchema: true, migrationsTable: authMigrationTableName, executed: migrationNames(applied), executedCount: applied.length })); } finally { await orm.close(true); } }
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
