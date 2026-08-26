import type { Tree } from 'nx/src/generators/tree';
import { createNxTreeAdapter, readJsonFile } from '../../setup/adapters/nx-tree.ts';
import { parseNrbConfig, type NrbConfig } from '../../setup/schema.ts';
import { emptyState, migrateState } from '../../setup/state.ts';
import { createIdentityManifestConfig, isIdentityManifest, type IdentityManifest } from '../../reconfigure/engine.ts';
import { runReconfigure } from '../../reconfigure/run.ts';

export interface ReconfigureGeneratorOptions {
  config?: string;
  dryRun?: boolean;
  force?: boolean;
}

export async function reconfigureGenerator(tree: Tree, options: ReconfigureGeneratorOptions): Promise<void> {
  const configPath = options.config ?? 'nrb.config.json';
  const rawConfig = readJsonFile(tree, configPath);
  if (!rawConfig) throw new Error(`Configuration file not found: ${configPath}`);
  const desired = parseNrbConfig(rawConfig);
  const rawManifest = readJsonFile<unknown>(tree, '.nrb/identity.json');
  if (rawManifest !== null && !isIdentityManifest(rawManifest)) {
    throw new Error('.nrb/identity.json is malformed; restore it or pass --force.');
  }
  const manifest = rawManifest as IdentityManifest | null;
  const rawState = readJsonFile<unknown>(tree, '.nrb/state.json');
  const state = rawState === null ? emptyState : migrateState(rawState);
  const result = await runReconfigure({
    fs: createNxTreeAdapter(tree),
    desired,
    previous: createIdentityManifestConfig(desired, manifest),
    manifest,
    state,
    templateBase: manifest?.templateBase ?? 'nx-tree',
    dryRun: options.dryRun,
    force: options.force,
  });

  if (result.status === 'conflict') {
    throw new Error(`Refused drifted files: ${result.conflicts.map((conflict) => conflict.path).join(', ')}`);
  }
  if (result.status === 'rolled-back') throw new Error(result.error ?? 'Reconfigure failed and was rolled back.');
  printPlan(result.plan.rewriteOperations, desired, result.status);
}

function printPlan(operations: readonly { path: string }[], _config: NrbConfig, status: string): void {
  if (status === 'dry-run') {
    if (operations.length === 0) {
      console.log('Already up to date — zero file operations.');
      return;
    }
    for (const operation of operations) console.log(`UPDATE ${operation.path}`);
  }
}

export default reconfigureGenerator;
