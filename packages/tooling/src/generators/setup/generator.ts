/**
 * Setup Nx generator — configures boilerplate setup through the shared
 * planner engine applied to an Nx Tree.
 *
 * Produces `nrb.config.json` and `.nrb/summary.md` according to the resolved
 * config (preset expansion + dependency resolution + validation).
 */
import type { Tree } from 'nx/src/generators/tree';
import { formatFiles } from '@nx/devkit';
import { plan, resolveConfig } from '../../setup/planner.js';
import { parseNrbConfig, type NrbConfig } from '../../setup/schema.js';
import { createNxTreeAdapter, readJsonFile } from '../../setup/adapters/nx-tree.js';
import { updateSelection } from '../../setup/selection.js';

// ---------------------------------------------------------------------------

export interface SetupGeneratorOptions {
  preset?: string;
  apps?: string[];
  capabilities?: string[];
  removeApps?: string[];
  removeCapabilities?: string[];
  replace?: boolean;
  prune?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------

export async function setupGenerator(tree: Tree, options: SetupGeneratorOptions): Promise<void> {
  const rawExisting = readJsonFile(tree, 'nrb.config.json');
  const existing: NrbConfig | null = rawExisting ? parseNrbConfig(rawExisting) : null;
  const hasSelection =
    options.preset !== undefined ||
    (options.apps?.length ?? 0) > 0 ||
    (options.capabilities?.length ?? 0) > 0 ||
    (options.removeApps?.length ?? 0) > 0 ||
    (options.removeCapabilities?.length ?? 0) > 0 ||
    options.replace === true;
  if (!existing && !hasSelection) {
    throw new Error('Setup requires an explicit preset or application selection on first run.');
  }
  if (!existing && ((options.removeApps?.length ?? 0) > 0 || (options.removeCapabilities?.length ?? 0) > 0)) {
    throw new Error('Cannot remove selections before setup has created nrb.config.json.');
  }

  const config = hasSelection
    ? updateSelection(existing, {
        preset: options.preset,
        addApps: options.apps,
        addCapabilities: options.capabilities,
        removeApps: options.removeApps,
        removeCapabilities: options.removeCapabilities,
        replace: options.replace,
        options: {
          prune: options.prune ?? false,
          force: options.force ?? false,
          dryRun: options.dryRun ?? false,
          nonInteractive: true,
        },
      })
    : parseNrbConfig({
        ...existing,
        options: {
          prune: options.prune ?? false,
          force: options.force ?? false,
          dryRun: options.dryRun ?? false,
          nonInteractive: true,
        },
      });

  // Validate and resolve the config (preset expansion, dependency resolution)
  const { apps, capabilities } = resolveConfig(config);

  if (!options.dryRun) {
    console.log(`Setting up with ${apps.length} apps and ${capabilities.length} capabilities`);
  }

  // Plan operations
  const result = plan(config);

  if (options.dryRun) {
    // Dry run: output plan as JSON
    console.log('DRY-RUN: plan would produce:');
    for (const op of result.operations) {
      if (op.kind === 'create_file' || op.kind === 'update_file') {
        console.log(`  ${op.kind === 'create_file' ? 'CREATE' : 'UPDATE'} ${op.path}`);
      } else if (op.kind === 'delete_file') {
        console.log(`  DELETE ${op.path}`);
      }
    }
    console.log(`Config hash: ${result.configHash}`);
    return;
  }

  // Apply operations to the tree
  const fs = createNxTreeAdapter(tree);

  // Execute each operation
  for (const op of result.operations) {
    if (op.kind === 'create_file' || op.kind === 'update_file') {
      await fs.write(op.path, op.content);
    } else if (op.kind === 'delete_file') {
      await fs.delete(op.path);
    }
  }

  // Format files
  await formatFiles(tree);
}

// ---------------------------------------------------------------------------

export default setupGenerator;
