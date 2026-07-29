#!/usr/bin/env node
import { loadDotEnv } from './env-loader.ts';
import type { DatabaseMigrationProvider } from './deployment-provider.ts';
import { loadProviderCommandModule } from './provider-command.ts';

loadDotEnv();

export async function loadMigrationImplementation(
  provider: DatabaseMigrationProvider,
): Promise<() => Promise<void>> {
  const implementation = await loadProviderCommandModule(provider, 'migrate');
  return (provider === 'postgres'
    ? implementation.migratePostgresDatabase
    : implementation.migrateMongoDatabase) as () => Promise<void>;
}

export async function runDatabaseMigrations(provider: DatabaseMigrationProvider): Promise<void> {
  const migrate = (await loadMigrationImplementation(provider)) as () => Promise<unknown>;
  if (provider === 'mongodb') console.log('[migrate] Applying MongoDB migrations...');
  const result = await migrate();
  if (provider === 'mongodb') {
    const migration = result as unknown as { database: string; applied: string[]; skipped: string[] };
    console.log(
      JSON.stringify({
        status: 'ok',
        provider,
        database: migration.database,
        mongoApplied: migration.applied.length,
        mongoSkipped: migration.skipped.length,
      }),
    );
    console.log('[migrate] All MongoDB migrations completed successfully.');
  }
}

async function main(): Promise<void> {
  const { resolveDatabaseMigrationProvider } = await import('./migration-provider.ts');
  const provider = await resolveDatabaseMigrationProvider();
  await runDatabaseMigrations(provider);
}

const invokedDirectly = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
