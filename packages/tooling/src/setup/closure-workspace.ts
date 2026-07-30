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
import { appCatalog, capabilityCatalog, type DurableDatabaseProviderId } from './catalog.js';
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
  return buildSelectedClosure(graph ?? (await createLiveProjectGraph()), {
    apps: selection.apps,
    capabilities: selection.capabilities,
    configHash: selection.configHash,
    product: selection.product,
    deployment: selection.deployment,
  });
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

function allReferenceConfig(provider: DurableDatabaseProviderId) {
  const apps = Object.keys(appCatalog).sort() as Array<keyof typeof appCatalog>;
  const capabilities = Object.keys(capabilityCatalog)
    .filter((capability) => capability !== (provider === 'postgres' ? 'mongodb' : 'postgres'))
    .sort() as Array<keyof typeof capabilityCatalog>;
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
  const oppositeProviderProjects = new Set(providerProjects(provider === 'postgres' ? 'mongodb' : 'postgres'));
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
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- reference contexts must use the repository's Corepack-selected pnpm.
  const result = spawnSync('pnpm', ['install', '--lockfile-only', '--offline', '--ignore-scripts'], {
    cwd: contextRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `Offline reference closure lock generation failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}
