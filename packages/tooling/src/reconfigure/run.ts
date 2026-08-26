import type { FilesystemAdapter, FileConflict } from '../setup/adapters/filesystem.ts';
import { apply, backupFiles, rollback, type ApplyOptions } from '../setup/apply.ts';
import { updateFile } from '../setup/operations.ts';
import type { NrbConfig } from '../setup/schema.ts';
import { buildState, hashString, type SetupState } from '../setup/state.ts';
import {
  identityManifestPath,
  planReconfigure,
  serializeJson,
  setupStatePath,
  verifyIdentityManifest,
  type IdentityManifest,
  type ReconfigurePlan,
} from './engine.ts';
import { runVerificationGate, type ReconfigureGateMode } from './verify.ts';

export interface RunReconfigureOptions {
  fs: FilesystemAdapter;
  desired: NrbConfig;
  previous: NrbConfig;
  manifest: IdentityManifest | null;
  state: SetupState;
  templateBase: string;
  workspaceRoot?: string;
  gate?: ReconfigureGateMode;
  dryRun?: boolean;
  force?: boolean;
  includeMetadata?: boolean;
  failOnPaths?: string[];
  targetPaths?: readonly string[];
  verify?: typeof runVerificationGate;
  audit?: () => Promise<{ ok: boolean; report?: string }>;
}
export interface RunReconfigureResult {
  plan: ReconfigurePlan;
  status: 'dry-run' | 'updated' | 'already-up-to-date' | 'conflict' | 'rolled-back';
  conflicts: FileConflict[];
  gate?: 'green' | 'skipped';
  failedGate?: string;
  error?: string;
}
export async function runReconfigure(options: RunReconfigureOptions): Promise<RunReconfigureResult> {
  const planOptions = { ...options, includeMetadata: false };
  if (options.manifest && !options.force) {
    const drifted = await verifyIdentityManifest(options.manifest, options.fs);
    if (drifted.length > 0)
      return {
        plan: await planReconfigure(planOptions),
        status: 'conflict',
        conflicts: drifted.map((path) => ({ path, reason: 'content_changed' as const })),
      };
  }
  const plan = await planReconfigure(planOptions);
  if (options.dryRun) return { plan, status: 'dry-run', conflicts: [] };
  const gate = options.gate ?? 'off';
  if (gate === 'auto' && !options.workspaceRoot)
    return {
      plan,
      status: 'rolled-back',
      conflicts: [],
      failedGate: 'configuration',
      error: 'Verification gate requires workspaceRoot.',
    };
  const metadata =
    options.includeMetadata === false ? [] : [updateFile(identityManifestPath, ''), updateFile(setupStatePath, '')];
  const backups = await backupFiles([...plan.operations, ...metadata], options.fs);
  const stateFiles = {
    ...options.state.files,
    ...Object.fromEntries(
      Object.entries(options.manifest?.appliedFiles ?? {}).map(([path, entry]) => [path, entry.hash]),
    ),
  };
  const applyOptions: ApplyOptions = { force: options.force, stateFiles, failOnPaths: options.failOnPaths };
  const applied = await apply(plan.operations, options.fs, applyOptions);
  if (applied.failed > 0)
    return {
      plan,
      status: applied.conflicts.length > 0 ? 'conflict' : 'rolled-back',
      conflicts: applied.conflicts,
      ...(applied.rollbackError ? { error: applied.rollbackError } : {}),
    };
  const verification = await (options.verify ?? runVerificationGate)({
    workspaceRoot: options.workspaceRoot ?? '.',
    mode: gate,
    audit: options.audit,
  });
  if (verification.failedGate) {
    try {
      await rollback(backups, options.fs);
    } catch (error) {
      return {
        plan,
        status: 'rolled-back',
        conflicts: [],
        failedGate: verification.failedGate,
        error: `${verification.error ?? 'Verification failed.'}\nRollback failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    return {
      plan,
      status: 'rolled-back',
      conflicts: [],
      failedGate: verification.failedGate,
      error: verification.error,
    };
  }
  plan.manifest.gate = verification.outcome;
  if (options.includeMetadata !== false) {
    const manifestContent = serializeJson(plan.manifest);
    plan.state = buildState(
      plan.state.configHash,
      { ...plan.state.files, [identityManifestPath]: hashString(manifestContent) },
      plan.state.reconfiguredFiles,
    );
    const recorded = await apply(
      [updateFile(identityManifestPath, manifestContent), updateFile(setupStatePath, serializeJson(plan.state))],
      options.fs,
      { force: true },
    );
    if (recorded.failed > 0) {
      await rollback(backups, options.fs);
      return {
        plan,
        status: 'rolled-back',
        conflicts: [],
        error: recorded.rollbackError ?? 'Failed to record reconfigure state.',
      };
    }
  }
  return {
    plan,
    status: plan.rewriteOperations.length === 0 ? 'already-up-to-date' : 'updated',
    conflicts: [],
    gate: verification.outcome,
  };
}
