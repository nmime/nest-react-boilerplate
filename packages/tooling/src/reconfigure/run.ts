import type { FilesystemAdapter, FileConflict } from '../setup/adapters/filesystem.js';
import { apply, type ApplyOptions } from '../setup/apply.js';
import type { NrbConfig } from '../setup/schema.js';
import type { SetupState } from '../setup/state.js';
import { planReconfigure, verifyIdentityManifest, type IdentityManifest, type ReconfigurePlan } from './engine.js';

export interface RunReconfigureOptions {
  fs: FilesystemAdapter;
  desired: NrbConfig;
  previous: NrbConfig;
  manifest: IdentityManifest | null;
  state: SetupState;
  templateBase: string;
  dryRun?: boolean;
  force?: boolean;
  includeMetadata?: boolean;
  failOnPaths?: string[];
}

export interface RunReconfigureResult {
  plan: ReconfigurePlan;
  status: 'dry-run' | 'updated' | 'already-up-to-date' | 'conflict' | 'rolled-back';
  conflicts: FileConflict[];
  error?: string;
}

export async function runReconfigure(options: RunReconfigureOptions): Promise<RunReconfigureResult> {
  if (options.manifest && !options.force) {
    const drifted = await verifyIdentityManifest(options.manifest, options.fs);
    if (drifted.length > 0) {
      return {
        plan: await planReconfigure(options),
        status: 'conflict',
        conflicts: drifted.map((path) => ({ path, reason: 'content_changed' as const })),
      };
    }
  }

  const plan = await planReconfigure(options);
  if (options.dryRun) return { plan, status: 'dry-run', conflicts: [] };
  if (plan.operations.length === 0) return { plan, status: 'already-up-to-date', conflicts: [] };

  const stateFiles = {
    ...options.state.files,
    ...Object.fromEntries(
      Object.entries(options.manifest?.appliedFiles ?? {}).map(([path, entry]) => [path, entry.hash]),
    ),
  };
  const applyOptions: ApplyOptions = {
    force: options.force,
    stateFiles,
    failOnPaths: options.failOnPaths,
  };
  const result = await apply(plan.operations, options.fs, applyOptions);
  if (result.failed > 0) {
    return {
      plan,
      status: result.conflicts.length > 0 ? 'conflict' : 'rolled-back',
      conflicts: result.conflicts,
      ...(result.rollbackError ? { error: result.rollbackError } : {}),
    };
  }
  return { plan, status: plan.rewriteOperations.length === 0 ? 'already-up-to-date' : 'updated', conflicts: [] };
}
