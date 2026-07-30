import type { SelectedClosureManifest } from '../../setup/closure.js';
import { validateCurrentClosure } from '../../setup/closure-workspace.js';

import type { DatabaseMigrationProvider } from './deployment-provider.js';

export * from './deployment-provider.js';

export async function resolveDatabaseMigrationProvider(
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
  validateClosure: (workspaceRoot: string) => Promise<SelectedClosureManifest> = validateCurrentClosure,
): Promise<DatabaseMigrationProvider> {
  const closure = await validateClosure(workspaceRoot);
  return validateProviderSelection(closure.provider, env);
}

function validateProviderSelection(
  selectedProvider: SelectedClosureManifest['provider'],
  env: NodeJS.ProcessEnv,
): DatabaseMigrationProvider {
  const environmentProvider = databaseProviderFromEnvironment(env);
  const databaseEngine = normalizedValue(env.DATABASE_ENGINE);
  if (!selectedProvider) {
    throw new Error(
      'The selected closure is provider-free; database commands require a PostgreSQL or MongoDB capability.',
    );
  }
  if (environmentProvider && environmentProvider !== selectedProvider) {
    const selector = databaseEngine ? 'DATABASE_ENGINE' : 'AUTH_PERSISTENCE';
    throw new Error(`${selector} selects ${environmentProvider}, but the selected closure uses ${selectedProvider}.`);
  }
  return selectedProvider;
}

function databaseProviderFromEnvironment(env: NodeJS.ProcessEnv): DatabaseMigrationProvider | undefined {
  const authPersistence = normalizedValue(env.AUTH_PERSISTENCE);
  const databaseEngine = normalizedValue(env.DATABASE_ENGINE);

  if (authPersistence !== undefined && !['memory', 'postgres', 'mongodb'].includes(authPersistence)) {
    throw new Error('AUTH_PERSISTENCE must be one of memory, postgres, or mongodb.');
  }
  if (databaseEngine !== undefined && !['postgres', 'mongodb'].includes(databaseEngine)) {
    throw new Error('DATABASE_ENGINE must be one of postgres or mongodb.');
  }
  if (
    authPersistence !== undefined &&
    authPersistence !== "memory" &&
    databaseEngine !== undefined &&
    authPersistence !== databaseEngine
  ) {
    throw new Error('AUTH_PERSISTENCE and DATABASE_ENGINE select different database providers.');
  }

  if (authPersistence === 'postgres' || authPersistence === 'mongodb') {
    return authPersistence;
  }
  return databaseEngine as DatabaseMigrationProvider | undefined;
}

function normalizedValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}
