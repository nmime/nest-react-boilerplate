import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { appCatalog, type ReleaseImageEntry } from '../setup/catalog.js';
import {
  createLiveProjectGraph,
  providerExternalPackages,
  providerProjects,
  type ProjectGraphLike,
  type SelectedClosureManifest,
} from '../setup/closure.js';
import { readClosureLockStatus, validateProductClosureBuildContext } from '../setup/closure-materializer.js';
import { buildConfiguredClosure, readConfiguredClosure } from '../setup/closure-workspace.js';

interface TargetLike {
  options?: Record<string, unknown>;
  outputs?: unknown;
}

export interface DeploymentGraphLike extends ProjectGraphLike {
  nodes: Record<
    string,
    {
      data: {
        root?: string;
        targets?: Record<string, TargetLike>;
      };
    }
  >;
}

export interface StagedDeploymentArtifact {
  project: string;
  artifactRoot: string;
  entry: string;
  outputPaths: string[];
  kind: 'backend' | 'site';
}

export interface DeploymentInstallPlan {
  command: 'pnpm';
  args: string[];
  cwd: string;
}

export async function loadCurrentSelectedClosure(
  workspaceRoot: string,
): Promise<{ closure: SelectedClosureManifest; graph: DeploymentGraphLike }> {
  const closure = readConfiguredClosure(workspaceRoot);
  if (readClosureLockStatus(workspaceRoot, closure) !== 'current') {
    throw new Error('.nrb/closure/pnpm-lock.yaml is missing or stale; run `pnpm nrb closure install`.');
  }
  validateProductClosureBuildContext(workspaceRoot, closure);

  const graph = (await createLiveProjectGraph()) as DeploymentGraphLike;
  const expected = await buildConfiguredClosure(workspaceRoot, graph);
  if (JSON.stringify(closure) !== JSON.stringify(expected)) {
    throw new Error('.nrb/closure.json does not match the selected live Nx graph; rerun `pnpm nrb setup`.');
  }

  return { closure, graph };
}

export function validateSelectedBuildProjects(closure: SelectedClosureManifest, value: string): string[] {
  const projects = value
    .split(',')
    .map((project) => project.trim())
    .filter(Boolean);
  if (projects.length === 0) {
    throw new Error('At least one selected closure build project is required.');
  }
  if (new Set(projects).size !== projects.length) {
    throw new Error('Selected closure build projects must be unique.');
  }

  const allowedTargets = new Set([...(closure.targets.build ?? []), ...(closure.targets.export ?? [])]);
  const selectedRoots = new Set(closure.roots);
  const selectedImages = new Set(closure.releaseImages);
  for (const project of projects) {
    if (!selectedRoots.has(project) || !allowedTargets.has(project) || !selectedImages.has(project)) {
      throw new Error(`Docker build project "${project}" is outside the selected closure.`);
    }
  }
  return projects;
}

export function validateSelectedMigrator(closure: SelectedClosureManifest): 'postgres' | 'mongodb' {
  if (!closure.provider || !closure.releaseImages.includes('migrator')) {
    throw new Error('The migrator image requires a selected PostgreSQL or MongoDB closure.');
  }
  return closure.provider;
}

export function linkSelectedSourceDependencies(
  workspaceRoot: string,
  graph: DeploymentGraphLike,
  closure: SelectedClosureManifest,
): void {
  const root = resolve(workspaceRoot);
  const dependencies = confinedPath(root, 'node_modules', 'selected source dependencies');
  if (!existsSync(dependencies) || !lstatSync(dependencies).isDirectory()) {
    throw new Error('Selected source dependency tree is missing; run the closure install before linking app roots.');
  }
  for (const project of closure.roots) {
    const projectRoot = graph.nodes[project]?.data.root;
    if (!projectRoot) {
      throw new Error(`Selected root project "${project}" has no Nx project root.`);
    }
    const destination = confinedPath(root, join(projectRoot, 'node_modules'), `source dependencies for ${project}`);
    if (existsSync(destination)) {
      throw new Error(`Selected root project "${project}" already has a node_modules entry.`);
    }
    symlinkSync(dependencies, destination, 'dir');
  }
}

export function stageSelectedMigratorManifest(
  workspaceRoot: string,
  artifactRoot: string,
  closure: SelectedClosureManifest,
): void {
  validateSelectedMigrator(closure);
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const resolvedArtifactRoot = resolve(artifactRoot);
  assertArtifactOutsideWorkspace(resolvedWorkspaceRoot, resolvedArtifactRoot);
  const sourceManifestPath = confinedPath(
    resolvedWorkspaceRoot,
    'docker/migrator-package.json',
    'migrator package manifest',
  );
  const selectedWorkspacePath = confinedPath(
    resolvedWorkspaceRoot,
    '.nrb/closure/pnpm-workspace.yaml',
    'selected closure workspace manifest',
  );
  requireFile(sourceManifestPath, 'Migrator package manifest is missing');
  requireFile(selectedWorkspacePath, 'Selected closure workspace manifest is missing');
  const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    [key: string]: unknown;
  };
  const forbidden =
    closure.provider === 'postgres' ? providerExternalPackages('mongodb') : providerExternalPackages('postgres');
  const dependencies = Object.fromEntries(
    Object.entries(sourceManifest.dependencies ?? {}).filter(
      ([dependency]) => !forbidden.has(dependency) && closure.externalPackages[dependency] !== undefined,
    ),
  );
  assertOppositeProviderPackages(closure, Object.keys(dependencies));
  const exactDependencies = selectedExactDependencies(closure, dependencies, 'Migrator');
  mkdirSync(resolvedArtifactRoot, { recursive: true });
  writeFileSync(
    join(resolvedArtifactRoot, 'package.json'),
    `${JSON.stringify({ ...sourceManifest, dependencies: exactDependencies }, null, 2)}\n`,
  );
  cpSync(selectedWorkspacePath, join(resolvedArtifactRoot, 'pnpm-workspace.yaml'));
}

export function selectedProjectClosure(
  graph: DeploymentGraphLike,
  closure: SelectedClosureManifest,
  project: string,
): string[] {
  if (!closure.roots.includes(project) || !closure.releaseImages.includes(project)) {
    throw new Error(`Deployment project "${project}" is outside the selected closure.`);
  }

  const allowed = new Set(closure.projects);
  const queue = [project];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    if (visited.has(current)) {
      continue;
    }
    if (!allowed.has(current)) {
      throw new Error(`Deployment project "${project}" reaches project "${current}" outside the selected closure.`);
    }
    if (!graph.nodes[current]) {
      throw new Error(`Selected deployment project "${current}" is missing from the Nx graph.`);
    }
    visited.add(current);
    enqueueProjectDependencies(graph, current, visited, queue);
    queue.sort((left, right) => left.localeCompare(right));
  }

  assertOppositeProviderAbsent(closure, visited);
  return [...visited].sort((left, right) => left.localeCompare(right));
}

function enqueueProjectDependencies(
  graph: DeploymentGraphLike,
  project: string,
  visited: ReadonlySet<string>,
  queue: string[],
): void {
  for (const dependency of graph.dependencies[project] ?? []) {
    if (graph.nodes[dependency.target] && !visited.has(dependency.target)) {
      queue.push(dependency.target);
    }
  }
}

export function selectedProjectOutputPaths(
  graph: DeploymentGraphLike,
  closure: SelectedClosureManifest,
  project: string,
): string[] {
  const projects = selectedProjectClosure(graph, closure, project);
  const outputs = new Set<string>();
  for (const selected of projects) {
    const target = graph.nodes[selected]?.data.targets?.build;
    if (!target) {
      continue;
    }
    for (const output of targetOutputPaths(target)) {
      outputs.add(confinedRelativePath(output, `build output for ${selected}`));
    }
  }

  const metadata = releaseImageFor(project);
  const requiredOutput =
    metadata?.buildOutput ?? (metadata?.target === 'site-runtime' ? 'dist/apps/frontend/site' : undefined);
  if (!requiredOutput) {
    throw new Error(`Deployment project "${project}" does not own a stageable runtime output.`);
  }
  outputs.add(confinedRelativePath(requiredOutput, `runtime output for ${project}`));
  return [...outputs].sort((left, right) => left.localeCompare(right));
}

export function stageDeploymentArtifact(options: {
  workspaceRoot: string;
  artifactRoot: string;
  graph: DeploymentGraphLike;
  closure: SelectedClosureManifest;
  project: string;
}): StagedDeploymentArtifact {
  const workspaceRoot = resolve(options.workspaceRoot);
  const artifactRoot = resolve(options.artifactRoot);
  assertArtifactOutsideWorkspace(workspaceRoot, artifactRoot);
  mkdirSync(artifactRoot, { recursive: true });

  const outputPaths = selectedProjectOutputPaths(options.graph, options.closure, options.project);
  for (const outputPath of outputPaths) {
    const source = confinedPath(workspaceRoot, outputPath, `source output ${outputPath}`);
    if (!existsSync(source)) {
      throw new Error(`Selected deployment output is missing: ${outputPath}`);
    }
    const destination = confinedPath(artifactRoot, outputPath, `artifact output ${outputPath}`);
    mkdirSync(resolve(destination, '..'), { recursive: true });
    copyConfinedOutput(source, destination);
  }

  const image = releaseImageFor(options.project);
  if (!image) {
    throw new Error(`Deployment project "${options.project}" has no release image metadata.`);
  }
  if (image.target === 'backend') {
    const buildOutput = confinedRelativePath(image.buildOutput ?? '', `backend output for ${options.project}`);
    const generatedManifest = confinedPath(
      workspaceRoot,
      join(buildOutput, 'package.json'),
      'backend package manifest',
    );
    const generatedLock = confinedPath(workspaceRoot, join(buildOutput, 'pnpm-lock.yaml'), 'backend pnpm lock');
    requireFile(generatedManifest, `Generated backend package manifest is missing for ${options.project}`);
    requireFile(generatedLock, `Generated backend pnpm lock is missing for ${options.project}`);
    const manifest = JSON.parse(readFileSync(generatedManifest, 'utf8')) as {
      main?: unknown;
      dependencies?: Record<string, string>;
    };
    if (typeof manifest.main !== 'string' || manifest.main.length === 0) {
      throw new Error(`Generated backend package manifest has no main entry for ${options.project}.`);
    }
    const selectedDependencies = Object.fromEntries(
      Object.keys(manifest.dependencies ?? {})
        .filter((dependency) => options.closure.externalPackages[dependency] !== undefined)
        .sort((left, right) => left.localeCompare(right))
        .map((dependency) => [dependency, options.closure.externalPackages[dependency]]),
    );
    assertOppositeProviderPackages(options.closure, Object.keys(selectedDependencies));
    writeFileSync(
      join(artifactRoot, 'package.json'),
      `${JSON.stringify({ ...manifest, dependencies: selectedDependencies }, null, 2)}\n`,
    );
    cpSync(generatedLock, join(artifactRoot, 'pnpm-lock.yaml'));
    const i18n = join(workspaceRoot, 'i18n');
    if (existsSync(i18n)) {
      copyConfinedOutput(i18n, join(artifactRoot, 'i18n'));
    }
    const entry = confinedPath(artifactRoot, join(buildOutput, manifest.main), 'backend runtime entry');
    requireFile(entry, `Staged backend runtime entry is missing for ${options.project}`);
    return { project: options.project, artifactRoot, entry, outputPaths, kind: 'backend' };
  }

  if (image.target === 'site-runtime') {
    const runtimeDependenciesPath = confinedPath(
      workspaceRoot,
      'apps/frontend/site/runtime-dependencies.json',
      'site runtime dependency contract',
    );
    const selectedWorkspacePath = confinedPath(
      workspaceRoot,
      '.nrb/closure/pnpm-workspace.yaml',
      'selected closure workspace manifest',
    );
    requireFile(runtimeDependenciesPath, 'Site runtime dependency contract is missing');
    requireFile(selectedWorkspacePath, 'Selected closure workspace manifest is missing');
    const runtimeDependencies: unknown = JSON.parse(readFileSync(runtimeDependenciesPath, 'utf8'));
    if (!isStringArray(runtimeDependencies)) {
      throw new Error('Site runtime dependency contract must be an array of package names.');
    }
    const dependencies = selectedExactDependencies(
      options.closure,
      Object.fromEntries(runtimeDependencies.map((dependency) => [dependency, dependency])),
      'Site',
    );
    writeFileSync(
      join(artifactRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: options.project,
          version: '0.0.0',
          private: true,
          type: 'module',
          dependencies,
        },
        null,
        2,
      )}\n`,
    );
    cpSync(selectedWorkspacePath, join(artifactRoot, 'pnpm-workspace.yaml'));
    const entry = confinedPath(artifactRoot, 'dist/apps/frontend/site/server/index.js', 'site runtime entry');
    requireFile(entry, 'Staged site runtime entry is missing');
    return { project: options.project, artifactRoot, entry, outputPaths, kind: 'site' };
  }

  throw new Error(`Deployment project "${options.project}" is not a server runtime image.`);
}

export function deploymentInstallPlan(artifact: StagedDeploymentArtifact): DeploymentInstallPlan {
  const common = ['install', '--prod', '--prefer-offline', '--no-frozen-lockfile', '--ignore-scripts'];
  return {
    command: 'pnpm',
    args: artifact.kind === 'backend' ? [...common, '--ignore-workspace'] : common,
    cwd: artifact.artifactRoot,
  };
}

export function isolatedRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const isolated = { ...environment };
  delete isolated.NODE_PATH;
  return isolated;
}

function targetOutputPaths(target: TargetLike): string[] {
  const outputPath = target.options?.outputPath;
  const outputs = Array.isArray(target.outputs)
    ? target.outputs.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  const values = [typeof outputPath === 'string' ? outputPath : undefined, ...outputs]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.replace(/^\{workspaceRoot\}\//u, ''))
    .map((value) => (typeof outputPath === 'string' ? value.replaceAll('{options.outputPath}', outputPath) : value))
    .filter((value) => !value.includes('{'));
  return [...new Set(values)];
}

function assertOppositeProviderAbsent(closure: SelectedClosureManifest, projects: ReadonlySet<string>): void {
  const opposite = oppositeProvider(closure.provider);
  const forbidden = new Set([
    ...(opposite ? providerProjects(opposite) : providerProjects('postgres')),
    ...(!closure.provider ? providerProjects('mongodb') : []),
  ]);
  const leaked = [...projects].filter((project) => forbidden.has(project));
  if (leaked.length > 0) {
    throw new Error(`Deployment artifact reaches opposite-provider projects: ${leaked.join(', ')}`);
  }
}

function assertOppositeProviderPackages(closure: SelectedClosureManifest, packages: readonly string[]): void {
  const opposite = oppositeProvider(closure.provider);
  const forbidden = opposite
    ? providerExternalPackages(opposite)
    : new Set([...providerExternalPackages('postgres'), ...providerExternalPackages('mongodb')]);
  const leaked = packages.filter((dependency) => forbidden.has(dependency));
  if (leaked.length > 0) {
    throw new Error(`Deployment artifact reaches opposite-provider packages: ${leaked.join(', ')}`);
  }
}

function selectedExactDependencies(
  closure: SelectedClosureManifest,
  dependencies: Readonly<Record<string, string>>,
  label: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(dependencies)
      .sort((left, right) => left.localeCompare(right))
      .map((dependency) => {
        const version = closure.externalPackages[dependency];
        if (!version) {
          throw new Error(`${label} dependency "${dependency}" is outside the selected closure.`);
        }
        return [dependency, version];
      }),
  );
}

function releaseImageFor(project: string): Readonly<ReleaseImageEntry> | undefined {
  if (!Object.hasOwn(appCatalog, project)) {
    return undefined;
  }
  return appCatalog[project as keyof typeof appCatalog].releaseImage;
}

function oppositeProvider(provider: SelectedClosureManifest['provider']): 'postgres' | 'mongodb' | undefined {
  if (provider === 'postgres') {
    return 'mongodb';
  }
  if (provider === 'mongodb') {
    return 'postgres';
  }
  return undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

function confinedRelativePath(value: string, label: string): string {
  if (!value || isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty workspace-relative path.`);
  }
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} escapes its allowed root: ${value}`);
  }
  return normalized;
}

function confinedPath(root: string, value: string, label: string): string {
  const relativePath = confinedRelativePath(value, label);
  const path = resolve(root, relativePath);
  const fromRoot = relative(resolve(root), path);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${label} escapes its allowed root: ${value}`);
  }
  return path;
}

function copyConfinedOutput(source: string, destination: string): void {
  if (lstatSync(source).isSymbolicLink()) {
    throw new Error(`Deployment output root must not be a symbolic link: ${source}`);
  }
  const sourceRoot = realpathSync(source);
  cpSync(source, destination, {
    recursive: true,
    filter: (current) => {
      if (current.split(sep).includes('node_modules')) {
        return false;
      }
      if (!lstatSync(current).isSymbolicLink()) {
        return true;
      }
      const target = realpathSync(current);
      const fromRoot = relative(sourceRoot, target);
      if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        throw new Error(`Deployment output symlink escapes the selected output: ${relative(source, current)}`);
      }
      return true;
    },
  });
}

function assertArtifactOutsideWorkspace(workspaceRoot: string, artifactRoot: string): void {
  const fromWorkspace = relative(workspaceRoot, artifactRoot);
  if (fromWorkspace === '' || (!fromWorkspace.startsWith(`..${sep}`) && fromWorkspace !== '..')) {
    throw new Error('Deployment artifact root must be outside the source workspace.');
  }
}

function requireFile(path: string, message: string): void {
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error(`${message}: ${path}`);
  }
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const workspaceRoot = process.cwd();
  const [command, first, second] = argv;
  const { closure, graph } = await loadCurrentSelectedClosure(workspaceRoot);
  if (command === 'validate-build' && first) {
    const projects = validateSelectedBuildProjects(closure, first);
    process.stdout.write(`${JSON.stringify({ status: 'ok', projects })}\n`);
    return;
  }
  if (command === 'validate-migrator') {
    process.stdout.write(`${JSON.stringify({ status: 'ok', provider: validateSelectedMigrator(closure) })}\n`);
    return;
  }
  if (command === 'link-source-dependencies') {
    linkSelectedSourceDependencies(workspaceRoot, graph, closure);
    process.stdout.write(`${JSON.stringify({ status: 'ok', projects: closure.roots })}\n`);
    return;
  }
  if (command === 'stage-migrator' && first) {
    stageSelectedMigratorManifest(workspaceRoot, first, closure);
    process.stdout.write(`${JSON.stringify({ status: 'ok', provider: closure.provider, artifactRoot: first })}\n`);
    return;
  }
  if (command === 'stage' && first && second) {
    const artifact = stageDeploymentArtifact({ workspaceRoot, artifactRoot: second, graph, closure, project: first });
    process.stdout.write(`${JSON.stringify({ status: 'ok', ...artifact })}\n`);
    return;
  }
  throw new Error(
    'Usage: deployment-artifact <validate-build <csv-projects>|validate-migrator|link-source-dependencies|stage-migrator <destination>|stage <project> <destination>>',
  );
}

const invokedDirectly = process.argv[1]?.endsWith('deployment-artifact.ts');
if (invokedDirectly) {
  await main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
