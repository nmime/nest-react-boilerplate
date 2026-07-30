// Minimal standalone migration entrypoint.
//
// Resolves the provider from deployment environment selectors and invokes the
// migration implementation directly via jiti. It deliberately avoids both the
// full tooling CLI and the local closure-aware command path: final images do
// not contain .nrb state or Nx tooling.
import { createJiti } from 'jiti';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const appRoot = resolve(dirname(currentFile), '..');
const jiti = createJiti(import.meta.url, {
  alias: {
    '@app/common-i18n-runtime': resolve(appRoot, 'libs/common/i18n/runtime/lib/src/index.ts'),
  },
});

export async function resolveMigratorDeploymentProvider(environment = process.env) {
  const { deploymentDatabaseProviderResolver } = await jiti.import(
    resolve(appRoot, 'packages/tooling/src/commands/db/deployment-provider.ts'),
  );
  return deploymentDatabaseProviderResolver.resolve({ environment });
}

export async function runMigrator({ environment = process.env, migrate } = {}) {
  const provider = await resolveMigratorDeploymentProvider(environment);
  const execute = migrate ?? (await loadMigratorImplementation(provider));
  await execute();
  return provider;
}

export async function loadMigratorImplementation(provider) {
  const commandsRoot = resolve(appRoot, 'packages/tooling/src/commands/db');
  const { providerCommandModulePath } = await jiti.import(resolve(commandsRoot, 'provider-command.ts'));
  const implementation = await jiti.import(resolve(commandsRoot, providerCommandModulePath(provider, 'migrate')));
  return provider === 'postgres' ? implementation.migratePostgresDatabase : implementation.migrateMongoDatabase;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === currentFile;
if (invokedDirectly) {
  await runMigrator().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
