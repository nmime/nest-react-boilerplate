#!/usr/bin/env node
import { loadDotEnv } from './env-loader.ts';
import { resolveDatabaseMigrationProvider } from './migration-provider.ts';
import { loadProviderCommandModule } from './provider-command.ts';

export async function runResetCommand(): Promise<void> {
  loadDotEnv();
  const provider = await resolveDatabaseMigrationProvider();
  const implementation = await loadProviderCommandModule(provider, 'reset');
  const reset = (provider === 'postgres'
    ? implementation.resetPostgresDatabase
    : implementation.resetMongoDatabase) as () => Promise<void>;
  await reset();
}

const invokedDirectly = process.argv[1]?.endsWith('reset.ts') || process.argv[1]?.endsWith('reset.js');
if (invokedDirectly) {
  runResetCommand().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
