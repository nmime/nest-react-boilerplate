import type { FilesystemAdapter, FileConflict } from '../setup/adapters/filesystem.ts';
import { apply, backupFiles, rollback, type ApplyOptions } from '../setup/apply.ts';
import { updateFile, type SetupOperation } from '../setup/operations.ts';
import type { NrbConfig } from '../setup/schema.ts';
import { buildState, hashString, type SetupState } from '../setup/state.ts';
import {
  defaultConfigPath,
  identityManifestPath,
  planReconfigure,
  serializeJson,
  setupStatePath,
  verifyIdentityManifest,
  type IdentityManifest,
  type ReconfigurePlan,
} from './engine.ts';
import { auditWorkspace } from './audit.ts';
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
  /** Renders setup-owned closure artifacts from the staged desired config. */
  deriveOperations?: (desired: NrbConfig) => Promise<SetupOperation[]>;
  /** Refuses a default-tenant rewrite after migrations/seeding unless explicitly overridden. */
  assertTenantChangeAllowed?: () => Promise<void>;
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
  const tenantChanged = options.previous.tenant.defaultTenantId !== options.desired.tenant.defaultTenantId;
  if (tenantChanged && !options.force) {
    if (!options.assertTenantChangeAllowed) {
      return {
        plan: await planReconfigure(planOptions),
        status: 'conflict',
        conflicts: [],
        error:
          'Refusing to change tenant.defaultTenantId without a fresh-database guard. Apply the new tenant id through a data migration or pass --force only for a known fresh scaffold.',
      };
    }
    try {
      await options.assertTenantChangeAllowed();
    } catch (error) {
      return {
        plan: await planReconfigure(planOptions),
        status: 'conflict',
        conflicts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (options.manifest && !options.force) {
    const drifted = await verifyIdentityManifest(options.manifest, options.fs);
    if (drifted.length > 0)
      return {
        plan: await planReconfigure(planOptions),
        status: 'conflict',
        conflicts: drifted.map((path) => ({ path, reason: 'content_changed' as const })),
        error: 'Tracked reconfigure files drifted.',
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
  let derivedOperations: SetupOperation[] = [];
  if (options.includeMetadata !== false && options.workspaceRoot) {
    try {
      const deriveOperations =
        options.deriveOperations ?? (options.workspaceRoot === '.' ? undefined : deriveClosureOperations);
      derivedOperations = deriveOperations ? await deriveOperations(options.desired) : [];
    } catch (error) {
      return {
        plan,
        status: 'rolled-back',
        conflicts: [],
        error: `Failed to derive closure artifacts: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  for (const operation of derivedOperations) {
    delete plan.manifest.appliedFiles[operation.path];
  }
  const metadata =
    options.includeMetadata === false
      ? []
      : [updateFile(defaultConfigPath, ''), updateFile(identityManifestPath, ''), updateFile(setupStatePath, '')];
  const backups = await backupFiles([...plan.operations, ...derivedOperations, ...metadata], options.fs);
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
  if (derivedOperations.length > 0) {
    const derived = await apply(derivedOperations, options.fs, { force: true });
    if (derived.failed > 0) {
      await rollback(backups, options.fs);
      return {
        plan,
        status: 'rolled-back',
        conflicts: [],
        error: derived.rollbackError ?? 'Failed to regenerate closure artifacts.',
      };
    }
  }
  if (options.includeMetadata !== false) {
    const stagedMetadata = await apply([updateFile(defaultConfigPath, serializeJson(options.desired))], options.fs, {
      force: true,
    });
    if (stagedMetadata.failed > 0) {
      await rollback(backups, options.fs);
      return {
        plan,
        status: 'rolled-back',
        conflicts: [],
        error: stagedMetadata.rollbackError ?? 'Failed to stage the desired configuration for verification.',
      };
    }
  }
  const verification = await (options.verify ?? runVerificationGate)({
    workspaceRoot: options.workspaceRoot ?? '.',
    mode: gate,
    audit:
      options.audit ??
      (async () => {
        const result = await auditWorkspace(options.fs, options.desired);
        return { ok: result.ok, report: result.report };
      }),
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
    const configContent = serializeJson(options.desired);
    const manifestContent = serializeJson(plan.manifest);
    const appliedFileHashes = Object.fromEntries(
      Object.entries(plan.manifest.appliedFiles).map(([path, entry]) => [path, entry.hash]),
    );
    const derivedFileHashes = Object.fromEntries(
      derivedOperations.flatMap((operation) =>
        operation.kind === 'update_file' || operation.kind === 'create_file'
          ? [[operation.path, hashString(operation.content)] as const]
          : [],
      ),
    );
    const reconfiguredFiles = Object.fromEntries(
      Object.entries(plan.manifest.appliedFiles).map(([path, entry]) => [path, entry.hash]),
    );
    const priorReconfiguredPaths = Object.keys(options.state.reconfiguredFiles ?? {});
    const baseStateFiles = Object.fromEntries(
      Object.entries(options.state.files).filter(([path]) => !priorReconfiguredPaths.includes(path)),
    );
    plan.state = buildState(
      plan.state.configHash,
      {
        ...baseStateFiles,
        ...appliedFileHashes,
        ...derivedFileHashes,
        [defaultConfigPath]: hashString(configContent),
        [identityManifestPath]: hashString(manifestContent),
      },
      reconfiguredFiles,
    );
    const recorded = await apply(
      [
        updateFile(defaultConfigPath, configContent),
        updateFile(identityManifestPath, manifestContent),
        updateFile(setupStatePath, serializeJson(plan.state)),
      ],
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
    status: plan.rewriteOperations.length === 0 && derivedOperations.length === 0 ? 'already-up-to-date' : 'updated',
    conflicts: [],
    gate: verification.outcome,
  };

  async function deriveClosureOperations(desired: NrbConfig): Promise<SetupOperation[]> {
    if (!options.workspaceRoot) return [];
    const [closureWorkspace, closureMaterializer, closureModule, planner] = await Promise.all([
      import('../setup/closure-workspace.ts'),
      import('../setup/closure-materializer.ts'),
      import('../setup/closure.ts'),
      import('../setup/planner.ts'),
    ]);
    const selection = planner.resolveConfig(desired);
    const summary: import('../setup/planner.ts').PlanSummary = {
      apps: [...selection.apps].sort(),
      capabilities: [...selection.capabilities].sort(),
      product: desired.product,
      deployment: desired.deployment,
      identity: desired.identity,
      runtime: desired.runtime,
      session: desired.session,
      tenant: desired.tenant,
      preset: desired.preset,
      configHash: plan.configHash,
    };
    const liveGraph = await closureModule.createLiveProjectGraph();
    const closure = closureModule.buildSelectedClosure(
      closureWorkspace.configuredClosureGraph(options.workspaceRoot, liveGraph),
      {
        apps: selection.apps,
        capabilities: selection.capabilities,
        configHash: plan.configHash,
        product: desired.product,
        deployment: desired.deployment,
        identity: desired.identity,
        runtime: desired.runtime,
        session: desired.session,
        tenant: desired.tenant,
      },
    );
    const artifactInputs = closureMaterializer.readClosureArtifactInputs(options.workspaceRoot);
    const artifacts = closureMaterializer.renderClosureArtifacts(options.workspaceRoot, closure, {
      ...artifactInputs,
      configContent: serializeJson(desired),
    });
    const operations: SetupOperation[] = [];
    const generated = [
      planner.generateSummaryMd(summary),
      planner.generateWorkspaceManifest(summary),
      planner.generateCapabilitiesManifest(summary),
      planner.generateComposeEnvironment(summary),
    ];
    for (const { path, content } of [...Object.values(artifacts), ...generated]) {
      if ((await options.fs.read(path)) !== content) {
        operations.push(updateFile(path, content, `Regenerate ${path} from nrb.config.json`));
      }
    }
    return operations;
  }
}
