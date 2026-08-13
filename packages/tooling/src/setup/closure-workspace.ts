import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
  buildSelectedClosure,
  createLiveProjectGraph,
  parseSelectedClosure,
  providerProjects,
  renderSelectedClosure,
} from './closure.js';
import type { ProjectGraphLike, SelectedClosureManifest } from './closure.js';
import {
  appCatalog,
  capabilityCatalog,
  expandDependencies,
  validateSelection,
  type DurableDatabaseProviderId,
} from './catalog.js';
import type { AppId, CapabilityId } from './schema.js';
import { configHash, hashString } from './state.js';
import { parseNrbConfig, schemaVersion } from './schema.js';
import { resolveConfig } from './planner.js';
import {
  renderClosureCaddyfile,
  renderClosureHelmValues,
  renderClosureSingleDomainCaddyfile,
  renderClosureWorkspace,
} from './closure-materializer.js';

export interface ConfiguredSelection {
  apps: ReadonlyArray<keyof typeof appCatalog>;
  capabilities: ReadonlyArray<keyof typeof capabilityCatalog>;
  configHash: string;
  product: ReturnType<typeof parseNrbConfig>['product'];
  deployment: ReturnType<typeof parseNrbConfig>['deployment'];
}

export function readConfiguredSelection(workspaceRoot: string): ConfiguredSelection {
  const configPath = join(workspaceRoot, 'nrb.config.json');
  if (!existsSync(configPath)) {
    throw new Error('nrb.config.json is missing; run `pnpm nrb setup`.');
  }
  const config = parseNrbConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const resolved = resolveConfig(config);
  return {
    apps: resolved.apps,
    capabilities: resolved.capabilities,
    configHash: configHash(config),
    product: config.product,
    deployment: config.deployment,
  };
}

export async function buildConfiguredClosure(
  workspaceRoot: string,
  graph?: ProjectGraphLike,
): Promise<SelectedClosureManifest> {
  const selection = readConfiguredSelection(workspaceRoot);
  const liveGraph = graph ?? (await createLiveProjectGraph());
  return buildSelectedClosure(configuredClosureGraph(workspaceRoot, liveGraph), {
    apps: selection.apps,
    capabilities: selection.capabilities,
    configHash: selection.configHash,
    product: selection.product,
    deployment: selection.deployment,
  });
}

export function configuredClosureGraph(workspaceRoot: string, graph: ProjectGraphLike): ProjectGraphLike {
  const provider = configuredReferenceProvider(workspaceRoot);
  return provider ? referenceProviderGraph(graph, provider) : graph;
}

export function configuredReferenceProvider(workspaceRoot: string): DurableDatabaseProviderId | undefined {
  const workspacePath = join(workspaceRoot, '.nrb', 'workspace.json');
  if (!existsSync(workspacePath)) {
    return undefined;
  }
  const workspace = JSON.parse(readFileSync(workspacePath, 'utf8')) as { mode?: unknown; provider?: unknown };
  if (workspace.mode !== 'all-reference') {
    return undefined;
  }
  if (workspace.provider !== 'postgres' && workspace.provider !== 'mongodb') {
    throw new Error('All-reference workspace must select postgres or mongodb.');
  }
  return workspace.provider;
}

export function readConfiguredClosure(workspaceRoot: string): SelectedClosureManifest {
  const path = join(workspaceRoot, '.nrb', 'closure.json');
  if (!existsSync(path)) {
    throw new Error('.nrb/closure.json is missing; rerun `pnpm nrb setup`.');
  }
  try {
    return parseSelectedClosure(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error(`.nrb/closure.json is invalid: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

export interface CurrentClosureValidationDependencies {
  readActual?: (workspaceRoot: string) => SelectedClosureManifest;
  buildExpected?: (workspaceRoot: string) => Promise<SelectedClosureManifest>;
}

export async function validateCurrentClosure(
  workspaceRoot: string,
  dependencies: CurrentClosureValidationDependencies = {},
): Promise<SelectedClosureManifest> {
  const actual = (dependencies.readActual ?? readConfiguredClosure)(workspaceRoot);
  const expected = await (dependencies.buildExpected ?? buildConfiguredClosure)(workspaceRoot);
  if (actual.configHash !== expected.configHash) {
    throw new Error('Selected closure config hash is stale; rerun `pnpm nrb setup`.');
  }
  if (actual.graphDigest !== expected.graphDigest) {
    throw new Error('Selected closure live graph digest is stale; rerun `pnpm nrb setup`.');
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Selected closure does not match current setup and Nx ownership; rerun `pnpm nrb setup`.');
  }
  return actual;
}

export function referenceClosurePath(provider: DurableDatabaseProviderId): string {
  return `.nrb/reference/${provider}/closure.json`;
}

export function referenceClosureContextPath(provider: DurableDatabaseProviderId): string {
  return `.nrb/reference/${provider}`;
}

/** The shape of a capability entry this filter reads; injectable so tests can supply fixtures. */
export interface ReferenceCatalogEntry {
  conflictsWith: readonly string[];
  requiresCapabilities: readonly string[];
  ownedProjects?: readonly string[];
  providerOwnedProjects?: Readonly<Partial<Record<DurableDatabaseProviderId, readonly string[]>>>;
}

/**
 * Capabilities the "everything" selection can hold for one provider.
 *
 * Dropping only the opposite provider is not enough: a capability may legitimately conflict
 * with THIS provider and still be in the catalog. `tenancy` is the first — it conflicts with
 * `mongodb` because MongoDB has no row-level security.
 *
 * Nor is dropping direct conflicts enough. `expandDependencies` transitively re-adds anything a
 * survivor requires, so a capability that merely *requires* a dropped one drags it back and the
 * selection fails validation — which surfaced as an unbuildable migrator image rather than as a
 * selection error. The filter is therefore a fixed point over `requiresCapabilities`, not a
 * predicate: it keeps dropping until nothing left reaches the drop-set. `dropped` only ever
 * grows, so a requirement cycle terminates.
 */
export function referenceCapabilities(
  catalog: Readonly<Record<string, ReferenceCatalogEntry>>,
  provider: DurableDatabaseProviderId,
): string[] {
  const dropped = new Set<string>([provider === 'postgres' ? 'mongodb' : 'postgres']);
  for (const [capability, entry] of Object.entries(catalog)) {
    if (entry.conflictsWith.includes(provider)) {
      dropped.add(capability);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [capability, entry] of Object.entries(catalog)) {
      if (dropped.has(capability)) {
        continue;
      }
      if (entry.requiresCapabilities.some((required) => dropped.has(required))) {
        dropped.add(capability);
        changed = true;
      }
    }
  }

  return Object.keys(catalog)
    .filter((capability) => !dropped.has(capability))
    .sort();
}

/**
 * Projects that belong to no capability in the reference selection for one provider.
 *
 * A dropped capability is out of the selection entirely, so every project it owns is out too —
 * including the ones it owns under the provider that *is* selected. Only pruning the opposite
 * provider's projects left those reachable from an application, and the image built them.
 */
export function excludedReferenceProjects(
  catalog: Readonly<Record<string, ReferenceCatalogEntry>>,
  provider: DurableDatabaseProviderId,
): string[] {
  const selected = new Set(referenceCapabilities(catalog, provider));
  const projects = new Set<string>();
  for (const [capability, entry] of Object.entries(catalog)) {
    if (selected.has(capability)) {
      continue;
    }
    for (const project of [
      ...(entry.ownedProjects ?? []),
      ...Object.values(entry.providerOwnedProjects ?? {}).flat(),
    ]) {
      projects.add(project);
    }
  }
  return [...projects].sort();
}

/**
 * The invariant the reference selection exists to uphold, enforced rather than commented: it
 * must still validate after `expandDependencies` has re-added everything it transitively pulls
 * in. A catalog entry that defeats the filter above fails here, at the source.
 */
export function assertReferenceSelectionIsValid(
  provider: DurableDatabaseProviderId,
  apps: readonly AppId[],
  capabilities: readonly CapabilityId[],
): void {
  const expanded = expandDependencies(apps, capabilities);
  const issues = validateSelection(expanded.apps, expanded.capabilities);
  if (issues.length > 0) {
    throw new Error(
      `The ${provider} reference selection is not valid: ${issues.map(({ message }) => message).join('; ')}`,
    );
  }
}

/**
 * The maintainer "everything" selection for one provider.
 *
 * Exported so tests can build their fixtures from it rather than restating the
 * filtering. A copy in `closure-workspace.test.ts` drifted the moment a
 * capability gained a `conflictsWith` entry, which is precisely the bug the
 * filter above exists to prevent.
 */
export function allReferenceConfig(provider: DurableDatabaseProviderId) {
  const apps = Object.keys(appCatalog).sort() as Array<keyof typeof appCatalog>;
  const capabilities = referenceCapabilities(capabilityCatalog, provider);
  assertReferenceSelectionIsValid(provider, apps, capabilities);
  const config = parseNrbConfig({
    schemaVersion,
    apps,
    capabilities,
    product: { ciMode: 'maintainer', frontendApiMode: 'same-origin', mobileTargets: ['web'] },
    options: { prune: false, force: false, dryRun: false, nonInteractive: true },
  });
  return { apps, capabilities, config };
}

export async function buildAllReferenceClosure(
  provider: DurableDatabaseProviderId,
  graph?: ProjectGraphLike,
): Promise<SelectedClosureManifest> {
  const { apps, capabilities, config } = allReferenceConfig(provider);
  const liveGraph = graph ?? (await createLiveProjectGraph());
  return buildSelectedClosure(referenceProviderGraph(liveGraph, provider), {
    apps,
    capabilities,
    configHash: configHash(config),
    product: config.product,
    deployment: config.deployment,
  });
}

function referenceProviderGraph(graph: ProjectGraphLike, provider: DurableDatabaseProviderId): ProjectGraphLike {
  const opposite = provider === 'postgres' ? 'mongodb' : 'postgres';
  // Two disjoint reasons to leave the graph: the opposite provider's own bindings, which every
  // capability may carry, and everything the capability filter dropped. Pruning only the first
  // left a dropped capability's libraries reachable from an application and back in the image.
  const oppositeProviderProjects = new Set([
    ...providerProjects(opposite),
    ...excludedReferenceProjects(capabilityCatalog, provider),
  ]);
  const applicationProjects = new Set(Object.keys(appCatalog));
  return {
    ...graph,
    dependencies: Object.fromEntries(
      Object.entries(graph.dependencies).map(([project, dependencies]) => [
        project,
        applicationProjects.has(project)
          ? dependencies.filter((dependency) => !oppositeProviderProjects.has(dependency.target))
          : dependencies,
      ]),
    ),
  };
}

export interface ReferenceClosureMaterializationDependencies {
  graph?: ProjectGraphLike;
  buildClosure?: (provider: DurableDatabaseProviderId) => Promise<SelectedClosureManifest>;
  generateLock?: (contextRoot: string) => void;
}

export async function materializeAllReferenceClosure(
  workspaceRoot: string,
  provider: DurableDatabaseProviderId,
  dependencies: ReferenceClosureMaterializationDependencies = {},
): Promise<SelectedClosureManifest> {
  const { apps, capabilities, config } = allReferenceConfig(provider);
  const closure = await (
    dependencies.buildClosure ?? ((selectedProvider) => buildAllReferenceClosure(selectedProvider, dependencies.graph))
  )(provider);
  const contextRoot = join(workspaceRoot, referenceClosureContextPath(provider));
  const rootPackage = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
    engines?: Record<string, string>;
  };
  const packageManifest = {
    name: `@nrb/reference-${provider}`,
    version: '0.0.0',
    private: true,
    packageManager: rootPackage.packageManager,
    engines: rootPackage.engines,
    dependencies: closure.productExternalPackages ?? {},
    devDependencies: closure.toolingExternalPackages ?? {},
    nrb: { mode: 'all-reference', provider, configHash: closure.configHash, graphDigest: closure.graphDigest },
  };
  const workspaceManifest = {
    schemaVersion: 1,
    mode: 'all-reference',
    provider,
    apps,
    capabilities,
    product: config.product,
    deployment: config.deployment,
    closure: 'closure.json',
  };

  mkdirSync(contextRoot, { recursive: true });
  writeFileSync(join(contextRoot, 'closure.json'), renderSelectedClosure(closure));
  writeFileSync(join(contextRoot, 'Caddyfile.per-app-domains'), renderClosureCaddyfile(closure));
  writeFileSync(join(contextRoot, 'Caddyfile.single-domain'), renderClosureSingleDomainCaddyfile(closure));
  writeFileSync(join(contextRoot, 'helm-values.yaml'), renderClosureHelmValues(closure));
  writeFileSync(join(contextRoot, 'nrb.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(contextRoot, 'workspace.json'), `${JSON.stringify(workspaceManifest, null, 2)}\n`);
  writeFileSync(join(contextRoot, 'package.json'), `${JSON.stringify(packageManifest, null, 2)}\n`);
  writeFileSync(
    join(contextRoot, 'pnpm-workspace.yaml'),
    renderClosureWorkspace(readFileSync(join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8')),
  );
  (dependencies.generateLock ?? generateReferenceLock)(contextRoot);
  const lockPath = join(contextRoot, 'pnpm-lock.yaml');
  if (!existsSync(lockPath)) {
    throw new Error(`Reference closure lock was not generated at ${lockPath}.`);
  }
  writeFileSync(
    join(contextRoot, 'lock.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        provider,
        configHash: closure.configHash,
        graphDigest: closure.graphDigest,
        lockHash: hashString(readFileSync(lockPath, 'utf8')),
      },
      null,
      2,
    )}\n`,
  );
  return closure;
}

function generateReferenceLock(contextRoot: string): void {
  const invocation = referenceLockInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: contextRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Reference closure lock generation failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

export function referenceLockInvocation(): { command: string; args: string[] } {
  return {
    command: 'pnpm',
    args: ['install', '--lockfile-only', '--prefer-offline', '--no-frozen-lockfile', '--ignore-scripts'],
  };
}
