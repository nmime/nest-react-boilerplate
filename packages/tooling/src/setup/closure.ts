import { createProjectGraphAsync } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';

import { appCatalog, capabilityCatalog, durableDatabaseProviderIds } from './catalog.js';
import type { DurableDatabaseProviderId } from './catalog.js';
import {
  defaultDeploymentConfig,
  defaultProductConfig,
  parseNrbConfig,
  schemaVersion,
  type AppId,
  type CapabilityId,
  type NrbConfig,
} from './schema.js';
import { hashString } from './state.js';

export const closureManifestPath = '.nrb/closure.json';
export const closurePackagePath = '.nrb/closure/package.json';
export const closureWorkspacePath = '.nrb/closure/pnpm-workspace.yaml';
export const closureLockPath = '.nrb/closure/pnpm-lock.yaml';
export const closureLockMetadataPath = '.nrb/closure/lock.json';

const postgresPackages = new Set([
  '@mikro-orm/core',
  '@mikro-orm/migrations',
  '@mikro-orm/nestjs',
  '@mikro-orm/postgresql',
  '@opentelemetry/instrumentation-pg',
  '@testcontainers/postgresql',
  '@types/pg',
  'pg',
]);
const mongodbPackages = new Set([
  '@opentelemetry/instrumentation-mongodb',
  '@testcontainers/mongodb',
  'mongodb',
  'mongodb-connection-string-url',
]);
const closureToolchainPackages = [
  '@eslint/js',
  '@nx/devkit',
  '@nx/eslint',
  '@nx/eslint-plugin',
  '@nx/js',
  '@nx/react',
  '@nx/vite',
  '@swc/helpers',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-sonarjs',
  'jiti',
  'jsdom',
  'jsonc-eslint-parser',
  'nx',
  'typescript',
  'typescript-eslint',
  'typescript-transform-paths',
  'zod',
] as const;

export interface SelectedClosureManifest {
  schemaVersion: 1;
  configHash: string;
  graphDigest: string;
  provider: DurableDatabaseProviderId | null;
  roots: string[];
  projects: string[];
  targets: Record<string, string[]>;
  productExternalPackages?: Record<string, string>;
  toolingExternalPackages?: Record<string, string>;
  /** Combined runtime view for existing internal consumers; omitted from serialized manifests. */
  externalPackages: Record<string, string>;
  services: string[];
  releaseImages: string[];
  product: NrbConfig['product'];
  deployment: NrbConfig['deployment'];
}

export interface ClosureInput {
  apps: readonly AppId[];
  capabilities: readonly CapabilityId[];
  configHash: string;
  product?: NrbConfig['product'];
  deployment?: NrbConfig['deployment'];
}

interface GraphNodeLike {
  data: {
    tags?: string[];
    targets?: Record<string, unknown>;
  };
}

interface ExternalNodeLike {
  data: {
    packageName?: string;
    version?: string;
  };
}

export interface ProjectGraphLike {
  nodes: Record<string, GraphNodeLike>;
  externalNodes?: Record<string, ExternalNodeLike>;
  dependencies: Record<string, Array<{ target: string; type?: string }>>;
}

export async function createLiveProjectGraph(): Promise<ProjectGraph> {
  return createProjectGraphAsync({ exitOnError: true, resetDaemonClient: true });
}

export function buildSelectedClosure(graph: ProjectGraphLike, input: ClosureInput): SelectedClosureManifest {
  const roots = [...new Set(input.apps)].sort();
  const selectedApps = new Set(roots);
  const provider = resolveProvider(input.capabilities);
  const product = input.product ?? {
    ...defaultProductConfig,
    mobileTargets: [...defaultProductConfig.mobileTargets],
  };
  const deployment = input.deployment ?? {
    ...defaultDeploymentConfig,
    targets: [...defaultDeploymentConfig.targets],
    infrastructure: { ...defaultDeploymentConfig.infrastructure },
  };
  const seedProjects = new Set<string>(roots);

  for (const capabilityId of input.capabilities) {
    const capability = capabilityCatalog[capabilityId];
    for (const project of capability.ownedProjects) {
      seedProjects.add(project);
    }
    if (provider) {
      for (const project of capability.providerOwnedProjects?.[provider] ?? []) {
        seedProjects.add(project);
      }
    }
  }
  const forbiddenProvider = provider === 'postgres' ? 'mongodb' : provider === 'mongodb' ? 'postgres' : undefined;
  const forbiddenProjects = new Set<string>([
    ...(forbiddenProvider ? providerProjects(forbiddenProvider) : providerProjects('postgres')),
    ...(!provider ? providerProjects('mongodb') : []),
  ]);
  const projects = traverseProjects(graph, seedProjects, selectedApps, forbiddenProjects);
  const productExternalPackages = collectProductExternalPackages(graph, projects, provider);
  const toolingExternalPackages = collectToolingExternalPackages(graph, provider);
  for (const packageName of Object.keys(productExternalPackages)) {
    delete toolingExternalPackages[packageName];
  }
  const targets = collectTargets(graph, roots, projects);
  const services = collectServices(input.apps, input.capabilities).filter((service) => {
    const ownershipKey = service === 'minio' ? 's3' : service === 'nats' || service === 'redis' ? service : undefined;
    return ownershipKey === undefined || deployment.infrastructure[ownershipKey] === 'bundled';
  });
  const releaseImages = [
    ...(provider ? ['migrator'] : []),
    ...roots.filter(
      (appId) =>
        appCatalog[appId]?.releaseImage !== undefined &&
        (appId !== 'mobile-app' || product.mobileTargets.includes('web')),
    ),
  ].sort();
  const graphDigest = digestClosureGraph(graph, projects, targets, productExternalPackages, toolingExternalPackages);

  return withCombinedExternalPackages({
    schemaVersion: 1,
    configHash: input.configHash,
    graphDigest,
    provider: provider ?? null,
    roots,
    projects,
    targets,
    productExternalPackages,
    toolingExternalPackages,
    services,
    releaseImages,
    product,
    deployment,
  });
}

export function parseSelectedClosure(raw: unknown): SelectedClosureManifest {
  if (!isRecord(raw) || raw.schemaVersion !== 1) {
    throw new Error('closure schemaVersion must equal 1.');
  }
  const requiredStrings = ['configHash', 'graphDigest'] as const;
  for (const key of requiredStrings) {
    if (typeof raw[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(raw[key])) {
      throw new Error(`closure ${key} must be a SHA-256 digest.`);
    }
  }
  if (raw.provider !== null && raw.provider !== 'postgres' && raw.provider !== 'mongodb') {
    throw new Error('closure provider must be postgres, mongodb, or null.');
  }

  const roots = stringArray(raw.roots, 'roots');
  const projects = stringArray(raw.projects, 'projects');
  const services = stringArray(raw.services, 'services');
  const releaseImages = stringArray(raw.releaseImages, 'releaseImages');
  if (!isRecord(raw.targets)) {
    throw new Error('closure targets must be an object.');
  }
  if (!isRecord(raw.productExternalPackages)) {
    throw new Error('closure productExternalPackages must be an object.');
  }
  if (!isRecord(raw.toolingExternalPackages)) {
    throw new Error('closure toolingExternalPackages must be an object.');
  }

  const targets = Object.fromEntries(
    Object.entries(raw.targets)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([target, values]) => [target, stringArray(values, `targets.${target}`)]),
  );
  const productExternalPackages = packageVersions(raw.productExternalPackages, 'productExternalPackages');
  const toolingExternalPackages = packageVersions(raw.toolingExternalPackages, 'toolingExternalPackages');
  const operational = parseNrbConfig({
    schemaVersion,
    apps: [],
    capabilities: [],
    product: raw.product,
    deployment: raw.deployment,
  });

  return withCombinedExternalPackages({
    schemaVersion: 1,
    configHash: raw.configHash as string,
    graphDigest: raw.graphDigest as string,
    provider: raw.provider,
    roots,
    projects,
    targets,
    productExternalPackages,
    toolingExternalPackages,
    services,
    releaseImages,
    product: operational.product,
    deployment: operational.deployment,
  });
}

export function renderSelectedClosure(manifest: SelectedClosureManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function providerProjects(provider: DurableDatabaseProviderId): string[] {
  const projects = new Set(capabilityCatalog[provider].ownedProjects);
  for (const capability of Object.values(capabilityCatalog)) {
    for (const project of capability.providerOwnedProjects?.[provider] ?? []) {
      projects.add(project);
    }
  }
  return [...projects].sort();
}

export function providerExternalPackages(provider: DurableDatabaseProviderId): ReadonlySet<string> {
  return provider === 'postgres' ? postgresPackages : mongodbPackages;
}

function resolveProvider(capabilities: readonly CapabilityId[]): DurableDatabaseProviderId | undefined {
  const providers = durableDatabaseProviderIds.filter((candidate) => capabilities.includes(candidate));
  if (providers.length > 1) {
    throw new Error(`Closure cannot select multiple database providers: ${providers.join(', ')}`);
  }
  return providers[0];
}

function traverseProjects(
  graph: ProjectGraphLike,
  seeds: ReadonlySet<string>,
  selectedApps: ReadonlySet<string>,
  forbiddenProjects: ReadonlySet<string>,
): string[] {
  const queue = [...seeds].sort();
  const visited = new Set<string>();
  const appIds = new Set<string>(Object.keys(appCatalog));

  while (queue.length > 0) {
    const project = queue.shift();
    if (project === undefined) {
      break;
    }
    if (visited.has(project)) {
      continue;
    }
    if (!graph.nodes[project]) {
      throw new Error(`Selected closure references unknown Nx project "${project}".`);
    }
    if (forbiddenProjects.has(project)) {
      throw new Error(`Selected closure reaches opposite database provider project "${project}".`);
    }
    if (appIds.has(project) && !selectedApps.has(project)) {
      throw new Error(`Selected closure leaks unselected application "${project}".`);
    }
    visited.add(project);

    const dependencies = (graph.dependencies[project] ?? [])
      .map(({ target }) => target)
      .filter((target) => graph.nodes[target] !== undefined)
      .sort();
    for (const dependency of dependencies) {
      if (!visited.has(dependency)) {
        queue.push(dependency);
      }
    }
    queue.sort();
  }

  return [...visited].sort();
}

function collectProductExternalPackages(
  graph: ProjectGraphLike,
  projects: readonly string[],
  provider: DurableDatabaseProviderId | undefined,
): Record<string, string> {
  const selected = new Map<string, string>();
  const forbidden =
    provider === 'postgres'
      ? mongodbPackages
      : provider === 'mongodb'
        ? postgresPackages
        : new Set([...postgresPackages, ...mongodbPackages]);

  for (const project of projects) {
    for (const dependency of graph.dependencies[project] ?? []) {
      const external = graph.externalNodes?.[dependency.target];
      if (!external) {
        continue;
      }
      addExternalPackage(selected, external, forbidden);
    }
  }

  // TypeScript can inject tslib imports into compiled backend output even when
  // source files have no explicit import for Nx to discover. Nest's ValidationPipe has the
  // same shape of invisible requirement: it resolves class-transformer and class-validator
  // through loadPackage() at construction time, and both are *optional* peers of
  // @nestjs/common, so pnpm installs them only if something declares them. No source file
  // imports class-transformer, so the edge-walk above cannot see it and a narrow selection
  // produces a closure whose API exits 1 on boot.
  if (projects.some((project) => graph.nodes[project]?.data.tags?.includes('platform:backend'))) {
    for (const packageName of ['tslib', 'class-transformer', 'class-validator']) {
      const external = findExternalNode(graph, packageName);
      if (external) {
        addExternalPackage(selected, external, forbidden);
      }
    }
  }

  for (const packageName of [...selected.keys()]) {
    const typesPackage = findExternalNode(graph, definitelyTypedPackageName(packageName));
    if (typesPackage) {
      addExternalPackage(selected, typesPackage, forbidden);
    }
  }

  return Object.fromEntries([...selected.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function definitelyTypedPackageName(packageName: string): string {
  if (packageName.startsWith('@types/')) {
    return packageName;
  }
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.slice(1).split('/');
    return `@types/${scope}__${name}`;
  }
  return `@types/${packageName}`;
}

function collectToolingExternalPackages(
  graph: ProjectGraphLike,
  provider: DurableDatabaseProviderId | undefined,
): Record<string, string> {
  const selected = new Map<string, string>();
  const forbidden =
    provider === 'postgres'
      ? mongodbPackages
      : provider === 'mongodb'
        ? postgresPackages
        : new Set([...postgresPackages, ...mongodbPackages]);

  for (const dependency of graph.dependencies['@repo/tooling'] ?? []) {
    const external = graph.externalNodes?.[dependency.target];
    if (external?.data.packageName && !forbidden.has(external.data.packageName)) {
      addExternalPackage(selected, external, forbidden);
    }
  }

  for (const packageName of closureToolchainPackages) {
    const external = findExternalNode(graph, packageName);
    if (!external) {
      throw new Error(`Nx graph does not expose required closure toolchain package "${packageName}".`);
    }
    addExternalPackage(selected, external, forbidden);
  }

  return Object.fromEntries([...selected.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function addExternalPackage(
  selected: Map<string, string>,
  external: ExternalNodeLike,
  forbidden: ReadonlySet<string>,
): void {
  const { packageName, version } = external.data;
  if (!packageName || !version) {
    throw new Error('Nx external dependency is missing packageName or version metadata.');
  }
  if (forbidden.has(packageName)) {
    throw new Error(`Selected closure reaches opposite database provider package "${packageName}".`);
  }
  const existing = selected.get(packageName);
  if (existing && existing !== version) {
    throw new Error(`Selected closure resolves conflicting versions for ${packageName}: ${existing}, ${version}.`);
  }
  selected.set(packageName, version);
}

function findExternalNode(graph: ProjectGraphLike, packageName: string): ExternalNodeLike | undefined {
  const exact = graph.externalNodes?.[`npm:${packageName}`];
  if (exact) {
    return exact;
  }
  return Object.values(graph.externalNodes ?? {}).find((node) => node.data.packageName === packageName);
}

function collectTargets(
  graph: ProjectGraphLike,
  roots: readonly string[],
  projects: readonly string[],
): Record<string, string[]> {
  const targets = new Map<string, string[]>();
  const transitiveTargets = new Set(['lint', 'typecheck', 'test', 'component-test', 'e2e']);
  for (const project of projects) {
    for (const target of Object.keys(graph.nodes[project]?.data.targets ?? {}).sort()) {
      if (!transitiveTargets.has(target) && !roots.includes(project)) {
        continue;
      }
      const projects = targets.get(target) ?? [];
      projects.push(project);
      targets.set(target, projects);
    }
  }
  return Object.fromEntries(
    [...targets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([target, projects]) => [target, [...projects].sort()]),
  );
}

function collectServices(apps: readonly AppId[], capabilities: readonly CapabilityId[]): string[] {
  const services = new Set<string>(apps.filter((app) => appCatalog[app].releaseImage !== undefined));
  for (const capabilityId of capabilities) {
    for (const service of capabilityCatalog[capabilityId].dockerServices) {
      services.add(service);
    }
  }
  return [...services].sort();
}

function digestClosureGraph(
  graph: ProjectGraphLike,
  projects: readonly string[],
  targets: Readonly<Record<string, string[]>>,
  productExternalPackages: Readonly<Record<string, string>>,
  toolingExternalPackages: Readonly<Record<string, string>>,
): string {
  const projectSet = new Set(projects);
  const dependencies = projects.flatMap((source) =>
    (graph.dependencies[source] ?? [])
      .filter(({ target }) => projectSet.has(target))
      .map(({ target, type }) => ({ source, target, type: type ?? 'static' })),
  );
  dependencies.sort((left, right) =>
    `${left.source}:${left.target}:${left.type}`.localeCompare(`${right.source}:${right.target}:${right.type}`),
  );
  return hashString(
    JSON.stringify({ projects, dependencies, targets, productExternalPackages, toolingExternalPackages }),
  );
}

function packageVersions(value: Record<string, unknown>, field: string): Record<string, string> {
  const packages: Record<string, string> = {};
  for (const [name, version] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`closure ${field}.${name} must be a version string.`);
    }
    packages[name] = version;
  }
  return packages;
}

function withCombinedExternalPackages(
  manifest: Omit<SelectedClosureManifest, 'externalPackages'>,
): SelectedClosureManifest {
  const closure = manifest as SelectedClosureManifest;
  Object.defineProperty(closure, 'externalPackages', {
    enumerable: false,
    value: {
      ...manifest.productExternalPackages,
      ...manifest.toolingExternalPackages,
    },
  });
  return closure;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`closure ${name} must be a string array.`);
  }
  const values = value as string[];
  if (
    new Set(values).size !== values.length ||
    values.some((entry, index) => {
      const previous = values[index - 1];
      return previous !== undefined && previous > entry;
    })
  ) {
    throw new Error(`closure ${name} must be unique and sorted.`);
  }
  return [...values];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
