import { isAbsolute, relative, resolve } from 'node:path';
import type { Tree } from 'nx/src/generators/tree';
import { logger, workspaceRoot } from '@nx/devkit';
import { createNxTreeAdapter, readJsonFile } from '../../setup/adapters/nx-tree.ts';
import { parseNrbConfig, type NrbConfig } from '../../setup/schema.ts';
import { emptyState, migrateState } from '../../setup/state.ts';
import { createIdentityManifestConfig, isIdentityManifest, type IdentityManifest } from '../../reconfigure/engine.ts';
import { runReconfigure } from '../../reconfigure/run.ts';

export interface ReconfigureGeneratorOptions {
  config?: string;
  plan?: boolean;
  force?: boolean;
}

export async function reconfigureGenerator(tree: Tree, options: ReconfigureGeneratorOptions): Promise<void> {
  const dryRun = options.plan ?? false;
  const configPath = normalizeConfigPath(options.config ?? 'nrb.config.json');
  const rawConfig = readJsonFile(tree, configPath);
  if (!rawConfig) throw new Error(`Configuration file not found: ${options.config ?? configPath}`);
  const desired = parseNrbConfig(rawConfig);
  const rawManifest = readJsonFile<unknown>(tree, '.nrb/identity.json');
  if (rawManifest !== null && !isIdentityManifest(rawManifest)) {
    throw new Error('.nrb/identity.json is malformed; restore it or pass --force.');
  }
  const manifest: IdentityManifest | null = rawManifest;
  const rawState = readJsonFile<unknown>(tree, '.nrb/state.json');
  const state = rawState === null ? emptyState : migrateState(rawState);
  const fs = createNxTreeAdapter(tree);
  const result = await runReconfigure({
    fs,
    desired,
    previous: createIdentityManifestConfig(desired, manifest),
    manifest,
    state,
    templateBase: manifest?.templateBase ?? 'nx-tree',
    gate: 'off',
    dryRun,
    force: options.force,
    includeMetadata: !dryRun,
    assertTenantChangeAllowed: async () => {
      for (const marker of ['.nrb/seeded', '.nrb/seed.json', '.nrb/seed-state.json']) {
        if (tree.exists(marker)) {
          throw new Error(
            `Refusing tenant.defaultTenantId rewrite because ${marker} records seeded state. Apply the tenant id with a data migration.`,
          );
        }
      }
    },
  });

  if (result.status === 'conflict') {
    throw new Error(
      result.error ?? `Refused drifted files: ${result.conflicts.map((conflict) => conflict.path).join(', ')}`,
    );
  }
  if (result.status === 'rolled-back') throw new Error(result.error ?? 'Reconfigure failed and was rolled back.');
  printPlan(result.plan.rewriteOperations, desired, result.status);
}

function normalizeConfigPath(configPath: string): string {
  if (!isAbsolute(configPath)) return configPath;
  const relativePath = relative(workspaceRoot, resolve(configPath)).replaceAll('\\', '/');
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..') {
    throw new Error(`Configuration file must be inside the Nx workspace: ${configPath}`);
  }
  return relativePath;
}

function printPlan(operations: readonly { path: string }[], _config: NrbConfig, status: string): void {
  if (status === 'dry-run') {
    if (operations.length === 0) {
      logger.info('Already up to date — zero file operations.');
      return;
    }
    for (const operation of operations) logger.info(`UPDATE ${operation.path}`);
  }
}

export default reconfigureGenerator;
