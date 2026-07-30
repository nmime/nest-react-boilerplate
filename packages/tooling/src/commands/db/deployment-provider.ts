export type DatabaseMigrationProvider = 'postgres' | 'mongodb';

export interface DeploymentDatabaseProviderInput {
  environment?: NodeJS.ProcessEnv;
}

export interface DeploymentDatabaseProviderResolver {
  resolve(input?: DeploymentDatabaseProviderInput): DatabaseMigrationProvider;
}

export const deploymentDatabaseProviderResolver: DeploymentDatabaseProviderResolver = Object.freeze({
  resolve({ environment = process.env }: DeploymentDatabaseProviderInput = {}): DatabaseMigrationProvider {
    return resolveDeploymentDatabaseProvider(environment);
  },
});

export function resolveDeploymentDatabaseProvider(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseMigrationProvider {
  const authPersistence = normalizedValue(environment.AUTH_PERSISTENCE);
  const databaseEngine = normalizedValue(environment.DATABASE_ENGINE);

  if (authPersistence !== 'postgres' && authPersistence !== 'mongodb') {
    throw new Error('AUTH_PERSISTENCE must explicitly select postgres or mongodb for deployment migrations.');
  }
  if (databaseEngine !== 'postgres' && databaseEngine !== 'mongodb') {
    throw new Error('DATABASE_ENGINE must explicitly select postgres or mongodb for deployment migrations.');
  }
  if (authPersistence !== databaseEngine) {
    throw new Error('AUTH_PERSISTENCE and DATABASE_ENGINE select different database providers.');
  }

  return databaseEngine;
}

function normalizedValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}
