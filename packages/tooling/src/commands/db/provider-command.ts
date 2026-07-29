import type { DatabaseMigrationProvider } from './deployment-provider.ts';

export type DatabaseProviderCommand = 'migrate' | 'reset' | 'seed' | 'backup' | 'restore' | 'restore-drill';

export function providerCommandModulePath(
  provider: DatabaseMigrationProvider,
  command: DatabaseProviderCommand,
): string {
  if (provider === 'postgres') {
    if (command === 'migrate') return './postgres-migrate.ts';
    if (command === 'reset') return './postgres-reset.ts';
    if (command === 'seed') return './postgres-seed.ts';
    return './postgres-archive.ts';
  }
  if (command === 'migrate') return './mongo-migrate.ts';
  if (command === 'reset') return './mongo-reset-command.ts';
  if (command === 'seed') return './mongo-seed-command.ts';
  return './mongo-archive.ts';
}

export async function loadProviderCommandModule(
  provider: DatabaseMigrationProvider,
  command: DatabaseProviderCommand,
): Promise<Record<string, unknown>> {
  return import(providerCommandModulePath(provider, command));
}
