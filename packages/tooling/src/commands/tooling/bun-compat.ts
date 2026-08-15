// Evidence for: REQ-SCAFFOLD-TOOLING-005
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { CommandContext } from '../../cli.js';
import {
  deploymentInstallPlan,
  isolatedRuntimeEnvironment,
  loadCurrentSelectedClosure,
  stageDeploymentArtifact,
  type StagedDeploymentArtifact,
} from '../../runtime/deployment-artifact.js';
import { detectJavaScriptRuntime } from '../../runtime/environment.js';
import { packageManagerInvocation } from '../../runtime/process.js';
import { providerExternalPackages, type SelectedClosureManifest } from '../../setup/closure.js';
import { appCatalog } from '../../setup/catalog.js';

const NX_PROBE_TIMEOUT_MS = 30 * 60_000;
const DEPLOYMENT_BUILD_TIMEOUT_MS = 30 * 60_000;
const DEPLOYMENT_INSTALL_TIMEOUT_MS = 15 * 60_000;
const COMPOSE_CHECK_TIMEOUT_MS = 30_000;
const COMPOSE_STARTUP_TIMEOUT_MS = 20 * 60_000;
const COMPOSE_MIGRATION_TIMEOUT_MS = 15 * 60_000;
const COMPOSE_CLEANUP_TIMEOUT_MS = 5 * 60_000;
const COMMAND_TERMINATION_GRACE_MS = 2_000;
const COMMAND_FORCE_KILL_WAIT_MS = 1_000;
const HTTP_REQUEST_TIMEOUT_MS = 5_000;
const HTTP_RUNTIME_READY_TIMEOUT_MS = 30_000;
const INFRASTRUCTURE_ENVIRONMENT_NAME = /^(?:AUTH_PERSISTENCE|AWS(?:_|$)|COMPOSE(?:_|$)|CONTAINER_DATABASE_URL|DATABASE_ENGINE|DATABASE_URL|DOCKER_DATABASE_URL|DOCKER_MONGODB_URI|MINIO(?:_|$)|MONGODB(?:_|$)|NATS(?:_|$)|NRB_CLOSURE_CONTEXT|PG[A-Z0-9_]*|POSTGRES(?:_|$)|REDIS(?:_|$)|S3(?:_|$))/iu;

export interface BunCompatibilityProbe {
  name: string;
  nxArgs: readonly string[];
  runtime?: 'bun' | 'node';
  environmentScope?: 'provider' | 'test';
}

export interface BunCompatibilityInvocation {
  program: string;
  args: readonly string[];
  environment: NodeJS.ProcessEnv;
}

export interface BunRuntimeSelection {
  provider: 'postgres' | 'mongodb' | null;
  projects: readonly string[];
  http: readonly string[];
  site?: 'site-app';
  headless: ReadonlyArray<'notification-consumer' | 'notification-scheduler'>;
}

export interface BunRuntimeExecutionProbe {
  project: string;
  kind: 'http' | 'site' | 'process';
}

export interface NodeBackedPnpmInvocation {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
}

export interface BoundedCommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'ignore' | 'inherit';
  timeoutMs: number;
  terminationGraceMs?: number;
  forceKillWaitMs?: number;
}

export function resolveBunRuntimeSelection(closure: SelectedClosureManifest): BunRuntimeSelection {
  const projects = closure.roots.filter((project) => {
    const target = appCatalog[project as keyof typeof appCatalog]?.releaseImage?.target;
    return target === 'backend' || target === 'site-runtime';
  });
  const headless = (['notification-consumer', 'notification-scheduler'] as const).filter((project) =>
    projects.includes(project),
  );
  const http = projects.filter(
    (project) =>
      appCatalog[project as keyof typeof appCatalog]?.releaseImage?.target === 'backend' &&
      !headless.includes(project as (typeof headless)[number]),
  );
  if (!closure.provider && (http.length > 0 || headless.length > 0)) {
    throw new Error('Selected backend Bun runtime probes require an explicit PostgreSQL or MongoDB provider.');
  }

  return {
    provider: closure.provider,
    projects,
    http,
    ...(closure.roots.includes('site-app') ? { site: 'site-app' as const } : {}),
    headless,
  };
}

export function createBunRuntimeExecutionProbes(
  selection: BunRuntimeSelection,
): readonly BunRuntimeExecutionProbe[] {
  return selection.projects.map((project) => {
    if (project === selection.site) return { project, kind: 'site' };
    if (selection.headless.includes(project as (typeof selection.headless)[number])) {
      return { project, kind: 'process' };
    }
    if (selection.http.includes(project)) return { project, kind: 'http' };
    throw new Error(`Selected Bun runtime project ${project} has no startup/readiness/lifecycle probe.`);
  });
}

export function createBunCompatibilityProbes(closure: SelectedClosureManifest): readonly BunCompatibilityProbe[] {
  const probes: BunCompatibilityProbe[] = [
    {
      name: 'Selected Nx project graph',
      nxArgs: ['show', 'projects', `--projects=${closure.projects.join(',')}`],
    },
  ];
  const buildProjects = closure.targets.build ?? [];
  if (buildProjects.length > 0) {
    probes.push({
      name: 'Selected closure builds',
      nxArgs: ['run-many', '-t', 'build', `--projects=${buildProjects.join(',')}`, '--parallel=1', '--skip-nx-cache'],
    });
  }
  const exportProjects = closure.targets.export ?? [];
  if (exportProjects.length > 0) {
    probes.push({
      name: 'Selected closure exports',
      nxArgs: ['run-many', '-t', 'export', `--projects=${exportProjects.join(',')}`, '--skip-nx-cache'],
      runtime: 'node',
    });
  }
  const testProjects = closure.targets.test ?? [];
  const nodeTestProjects = testProjects.filter(isNodeOnlyTestProject);
  const bunTestProjects = testProjects.filter((project) => !isNodeOnlyTestProject(project));
  const providerBunTestProjects = bunTestProjects.filter(isProviderApplicationTestProject);
  const ordinaryBunTestProjects = bunTestProjects.filter((project) => !isProviderApplicationTestProject(project));
  const providerNodeTestProjects = nodeTestProjects.filter(isProviderApplicationTestProject);
  const ordinaryNodeTestProjects = nodeTestProjects.filter((project) => !isProviderApplicationTestProject(project));
  if (ordinaryBunTestProjects.length > 0) {
    probes.push({
      name: 'Selected closure unit tests',
      nxArgs: [
        'run-many',
        '-t',
        'test',
        `--projects=${ordinaryBunTestProjects.join(',')}`,
        '--parallel=1',
        '--skip-nx-cache',
      ],
      environmentScope: 'test',
    });
  }
  if (providerBunTestProjects.length > 0) {
    probes.push({
      name: 'Selected provider application tests',
      nxArgs: [
        'run-many',
        '-t',
        'test',
        `--projects=${providerBunTestProjects.join(',')}`,
        '--parallel=1',
        '--skip-nx-cache',
      ],
      environmentScope: 'provider',
    });
  }
  if (ordinaryNodeTestProjects.length > 0) {
    probes.push({
      name: 'Node-only closure tests',
      nxArgs: [
        'run-many',
        '-t',
        'test',
        `--projects=${ordinaryNodeTestProjects.join(',')}`,
        '--parallel=1',
        '--skip-nx-cache',
      ],
      runtime: 'node',
      environmentScope: 'test',
    });
  }
  if (providerNodeTestProjects.length > 0) {
    probes.push({
      name: 'Node-only provider application tests',
      nxArgs: [
        'run-many',
        '-t',
        'test',
        `--projects=${providerNodeTestProjects.join(',')}`,
        '--parallel=1',
        '--skip-nx-cache',
      ],
      runtime: 'node',
      environmentScope: 'provider',
    });
  }
  if ((closure.targets.e2e ?? []).includes('auth-app-api')) {
    probes.push({
      name: 'Auth API end-to-end tests without the Node-only coverage provider',
      nxArgs: ['run', 'auth-app-api:e2e', '--skip-nx-cache', '--', '--coverage.enabled=false'],
    });
  }
  return probes;
}

export function isNodeOnlyTestProject(project: string): boolean {
  return project === 'fullstack-e2e' || project === 'acceptance-e2e' || project.endsWith('-acceptance-e2e');
}

function isProviderApplicationTestProject(project: string): boolean {
  return appCatalog[project as keyof typeof appCatalog]?.requiresDurableDatabase === true;
}

export async function runBunCompatibilityCommand(context: CommandContext): Promise<number> {
  if (context.argv.includes('--help') || context.argv.includes('-h')) {
    process.stdout.write(
      'Usage: pnpm run bun:check\n\nRuns the pinned Bun runtime contract against the setup-selected pnpm closure.\n',
    );
    return 0;
  }

  const runtime = detectJavaScriptRuntime();
  if (runtime.name !== 'bun') {
    process.stderr.write('Bun compatibility must execute under Bun. Run: pnpm run bun:check\n');
    return 1;
  }

  const pinnedVersion = readPinnedBunVersion(context.workspaceRoot);
  if (runtime.version !== pinnedVersion) {
    process.stderr.write(`Bun ${runtime.version} is active, but .bun-version requires ${pinnedVersion}.\n`);
    return 1;
  }

  try {
    const { closure, graph } = await loadCurrentSelectedClosure(context.workspaceRoot);
    const selection = resolveBunRuntimeSelection(closure);
    assertProviderIsolation(closure);
    const environment = compatibilityEnvironment();
    process.stdout.write(
      `Bun ${runtime.version} compatibility contract (${closure.provider ?? 'provider-free'} selected closure)\n`,
    );

    const infrastructure = await startSelectedInfrastructure(context.workspaceRoot, closure, environment);
    await runWithCleanup(async () => {
      const selectedEnvironment = isolatedRuntimeEnvironment({
        ...environment,
        ...infrastructure.runtimeEnvironment,
      });
      for (const probe of createBunCompatibilityProbes(closure)) {
        process.stdout.write(`\n==> ${probe.name}\n`);
        const probeEnvironment = createBunCompatibilityProbeEnvironment(probe, selectedEnvironment);
        const command = createBunCompatibilityInvocation(probe, probeEnvironment, process.execPath);
        await runBoundedCommand(command.program, command.args, probe.name, {
          cwd: context.workspaceRoot,
          env: command.environment,
          stdio: 'inherit',
          timeoutMs: NX_PROBE_TIMEOUT_MS,
        });
      }

      if (selection.projects.length > 0) {
        await buildCanonicalDeploymentArtifacts(context.workspaceRoot, selection.projects, selectedEnvironment);
      }
      await runSelectedRuntimeSmokes({
        workspaceRoot: context.workspaceRoot,
        closure,
        graph,
        selection,
        environment: selectedEnvironment,
      });
    }, infrastructure.stop);
  } catch (error: unknown) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }

  process.stdout.write('\nBun compatibility contract passed.\n');
  return 0;
}

export function createBunCompatibilityProbeEnvironment(
  probe: BunCompatibilityProbe,
  providerEnvironment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return probe.environmentScope === 'test'
    ? withoutInfrastructureEnvironment(providerEnvironment)
    : { ...providerEnvironment };
}

export function createBunCompatibilityInvocation(
  probe: BunCompatibilityProbe,
  environment: NodeJS.ProcessEnv,
  bunExecutable: string,
): BunCompatibilityInvocation {
  const probeEnvironment = { ...environment };
  if (probe.runtime === 'node') {
    return createCanonicalNodeInvocation(
      ['node_modules/nx/dist/bin/nx.js', ...probe.nxArgs],
      probeEnvironment,
      bunExecutable,
    );
  }

  return {
    program: bunExecutable,
    args: ['run', '--bun', 'nx', ...probe.nxArgs],
    environment: probeEnvironment,
  };
}

export async function runWithCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
  reportCleanupError: (error: unknown) => void = reportCleanupFailure,
): Promise<T> {
  let operationFailed = false;
  try {
    return await operation();
  } catch (error: unknown) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError: unknown) {
      if (!operationFailed) throw cleanupError;
      reportCleanupError(cleanupError);
    }
  }
}

export function readPinnedBunVersion(workspaceRoot: string): string {
  const versionPath = join(workspaceRoot, '.bun-version');
  if (!existsSync(versionPath)) throw new Error('.bun-version is required for reproducible Bun support.');
  const version = readFileSync(versionPath, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(`.bun-version must contain an exact semantic version; received: ${version || '<empty>'}`);
  }
  return version;
}

export function createNodeBackedPnpmInvocation(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  bunExecutable = activeBunExecutable(),
  platform: NodeJS.Platform = process.platform,
): NodeBackedPnpmInvocation {
  const packageManagerPath = environment.npm_execpath?.trim();
  const pnpmExecutable = packageManagerPath ? undefined : executableOnPath('pnpm', environment, platform);
  const nodeExecutable = resolveCanonicalNodeExecutable(environment, pnpmExecutable, bunExecutable, platform);
  const invocation = packageManagerInvocation([...args], { env: environment, nodeExecutable, platform });
  return {
    command: invocation.command === 'pnpm' ? (pnpmExecutable ?? executableOnPath('pnpm', environment, platform)) : invocation.command,
    args: invocation.args,
    environment: canonicalNodeEnvironment(environment, nodeExecutable, platform),
  };
}

export function createCanonicalNodeInvocation(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  bunExecutable = activeBunExecutable(),
  platform: NodeJS.Platform = process.platform,
): BunCompatibilityInvocation {
  const nodeExecutable = resolveCanonicalNodeExecutable(environment, undefined, bunExecutable, platform);
  return {
    program: nodeExecutable,
    args: [...args],
    environment: canonicalNodeEnvironment(environment, nodeExecutable, platform),
  };
}

export function resolveCanonicalNodeExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  pnpmExecutable?: string,
  bunExecutable = activeBunExecutable(),
  platform: NodeJS.Platform = process.platform,
): string {
  const configuredNode = environment.npm_node_execpath?.trim();
  const candidates = [
    ...(configuredNode ? [resolve(configuredNode)] : []),
    ...(pnpmExecutable
      ? executablePathCandidates(join(dirname(pnpmExecutable), 'node'), environment, platform)
      : []),
    ...executablesOnPath('node', environment, platform),
  ];
  const canonicalNode = [...new Set(candidates)].find(
    (candidate) => isCanonicalNodeExecutable(candidate, environment, bunExecutable),
  );
  if (!canonicalNode) {
    throw new Error('Canonical Node is required on PATH for Node-only tools and deployment dependency installation.');
  }
  return canonicalNode;
}

function canonicalNodeEnvironment(
  environment: NodeJS.ProcessEnv,
  nodeExecutable: string,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  const nodeEnvironment = { ...environment };
  delete nodeEnvironment.BUN_BE_BUN;
  nodeEnvironment.PATH = executableFirstPath(nodeExecutable, nodeEnvironment.PATH, platform);
  nodeEnvironment.npm_node_execpath = nodeExecutable;
  return nodeEnvironment;
}

function executableFirstPath(
  executable: string,
  currentPath: string | undefined,
  platform: NodeJS.Platform,
): string {
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  const executableDirectory = dirname(executable);
  const remainingDirectories = (currentPath ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .filter((directory) => resolve(directory) !== resolve(executableDirectory));
  return [executableDirectory, ...remainingDirectories].join(pathDelimiter);
}

function executableOnPath(name: string, environment: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const executable = executablesOnPath(name, environment, platform)[0];
  if (!executable) throw new Error(`${name} is required on PATH for deployment dependency installation.`);
  return executable;
}

function executablesOnPath(
  name: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  return (environment.PATH ?? '')
    .split(pathDelimiter)
    .filter(Boolean)
    .flatMap((directory) => executablePathCandidates(resolve(directory, name), environment, platform))
    .filter((candidate) => existsSync(candidate));
}

function executablePathCandidates(
  candidate: string,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  if (platform !== 'win32') return [candidate];
  const extensions = (environment.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const normalizedCandidate = candidate.toLowerCase();
  return extensions.some((extension) => normalizedCandidate.endsWith(extension.toLowerCase()))
    ? [candidate]
    : extensions.map((extension) => `${candidate}${extension}`);
}

function sameExecutable(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}

function isCanonicalNodeExecutable(
  candidate: string,
  environment: NodeJS.ProcessEnv,
  bunExecutable: string | undefined,
): boolean {
  if (!existsSync(candidate) || (bunExecutable && sameExecutable(candidate, bunExecutable))) return false;
  const probeEnvironment = { ...environment };
  delete probeEnvironment.BUN_BE_BUN;
  const result = spawnSync(
    candidate,
    ['--eval', "process.stdout.write(`${process.release.name}:${typeof Bun}`)"],
    {
      encoding: 'utf8',
      env: probeEnvironment,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    },
  );
  return result.status === 0 && result.stdout === 'node:undefined';
}

function activeBunExecutable(): string | undefined {
  return detectJavaScriptRuntime().name === 'bun' ? process.execPath : undefined;
}

function compatibilityEnvironment(): NodeJS.ProcessEnv {
  const environment = isolatedRuntimeEnvironment({
    ...withoutInfrastructureEnvironment(process.env),
    CI: process.env.CI ?? 'true',
    DATABASE_URL: 'postgresql://compat:compat@127.0.0.1:1/compat',
    MONGODB_DATABASE: 'compat',
    MONGODB_URI: 'mongodb://127.0.0.1:1/compat',
    NX_DAEMON: 'false',
    VITE_API_BASE_URL_MODE: 'same-origin',
  });
  delete environment.NO_COLOR;
  delete environment.FORCE_COLOR;
  return environment;
}

function withoutInfrastructureEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !INFRASTRUCTURE_ENVIRONMENT_NAME.test(name)),
  );
}

export function createBunComposeProfiles(closure: SelectedClosureManifest): string[] {
  const redisRequired =
    closure.services.includes('redis') ||
    closure.roots.some((root) => appCatalog[root as keyof typeof appCatalog]?.requiresCapabilities.includes('redis'));
  return [closure.provider, ...(redisRequired ? ['redis'] : [])].filter(
    (profile): profile is string => profile !== null,
  );
}

export function assertProviderIsolation(closure: SelectedClosureManifest): void {
  const opposite = closure.provider === 'postgres' ? 'mongodb' : closure.provider === 'mongodb' ? 'postgres' : undefined;
  const forbiddenProjectFragment = opposite ? `backend-${opposite}` : 'backend-postgres|backend-mongodb';
  const projectPattern = new RegExp(forbiddenProjectFragment, 'u');
  const leakedProjects = closure.projects.filter((project) => projectPattern.test(project));
  const forbiddenPackages: ReadonlySet<string> =
    closure.provider === 'postgres'
      ? providerExternalPackages('mongodb')
      : closure.provider === 'mongodb'
        ? providerExternalPackages('postgres')
        : new Set([...providerExternalPackages('postgres'), ...providerExternalPackages('mongodb')]);
  const leakedPackages = Object.keys(closure.externalPackages).filter((dependency) => forbiddenPackages.has(dependency));
  if (leakedProjects.length > 0 || leakedPackages.length > 0) {
    throw new Error(
      `Selected Bun closure contains opposite-provider ownership (projects: ${leakedProjects.join(', ') || 'none'}; packages: ${leakedPackages.join(', ') || 'none'}).`,
    );
  }
}

async function buildCanonicalDeploymentArtifacts(
  workspaceRoot: string,
  projects: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  process.stdout.write('\n==> Canonical pnpm/Node deployment artifacts\n');
  const invocation = createCanonicalNodeInvocation(
    [
      join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js'),
      'run-many',
      '-t',
      'build',
      `--projects=${projects.join(',')}`,
      '--skip-nx-cache',
    ],
    environment,
  );
  await runBoundedCommand(invocation.program, invocation.args, 'Canonical deployment build', {
    cwd: workspaceRoot,
    env: invocation.environment,
    stdio: 'inherit',
    timeoutMs: DEPLOYMENT_BUILD_TIMEOUT_MS,
  });
}

async function ensureMigratorImage(workspaceRoot: string, environment: NodeJS.ProcessEnv): Promise<void> {
  await runBoundedCommand(
    process.execPath,
    ['scripts/build-images.mjs', '--only', 'migrator'],
    'Bake the migrator image',
    {
      cwd: workspaceRoot,
      env: environment,
      stdio: 'inherit',
      timeoutMs: DEPLOYMENT_BUILD_TIMEOUT_MS,
    },
  );
}

interface InfrastructureHandle {
  runtimeEnvironment: NodeJS.ProcessEnv;
  stop: () => Promise<void>;
}

async function startSelectedInfrastructure(
  workspaceRoot: string,
  closure: SelectedClosureManifest,
  environment: NodeJS.ProcessEnv,
): Promise<InfrastructureHandle> {
  if (!closure.provider) return { runtimeEnvironment: {}, stop: async () => undefined };
  try {
    await runBoundedCommand('docker', ['compose', 'version'], 'Docker Compose version check', {
      cwd: workspaceRoot,
      stdio: 'ignore',
      timeoutMs: COMPOSE_CHECK_TIMEOUT_MS,
    });
  } catch (error: unknown) {
    throw new Error(`Docker Compose is required for the ${closure.provider} Bun runtime probe.`);
  }

  const projectName = `nrbbun${closure.provider}${process.pid}`;
  const databasePort = await reserveAvailablePort();
  const profiles = createBunComposeProfiles(closure);
  const redisSelected = profiles.includes('redis');
  const redisPort = redisSelected ? await reserveAvailablePort() : undefined;
  const compose = ['compose', '--project-name', projectName, '-f', 'docker/docker-compose.yml'];
  const databaseName = 'nest_react_boilerplate';
  const selectedEnvironment = isolatedRuntimeEnvironment({
    ...withoutInfrastructureEnvironment(environment),
    COMPOSE_PROJECT_NAME: projectName,
    COMPOSE_PROFILES: profiles.join(','),
    NRB_CLOSURE_CONTEXT: join(workspaceRoot, '.nrb/closure'),
    DATABASE_ENGINE: closure.provider,
    AUTH_PERSISTENCE: closure.provider,
  });
  if (closure.provider === 'postgres') {
    Object.assign(selectedEnvironment, {
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: databaseName,
      POSTGRES_PORT: String(databasePort),
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${databasePort}/${databaseName}`,
      CONTAINER_DATABASE_URL: `postgres://postgres:postgres@postgres:5432/${databaseName}`,
    });
  } else {
    Object.assign(selectedEnvironment, {
      MONGODB_PORT: String(databasePort),
      MONGODB_URI: createLocalMongoUri(databasePort, databaseName),
      MONGODB_DATABASE: databaseName,
      MONGODB_REPLICA_SET: 'rs0',
    });
  }
  if (redisPort !== undefined) {
    Object.assign(selectedEnvironment, {
      REDIS_PORT: String(redisPort),
      REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
    });
  }
  const runCompose = async (args: string[], timeoutMs: number): Promise<void> => {
    await runBoundedCommand('docker', [...compose, ...args], `docker ${[...compose, ...args].join(' ')}`, {
      cwd: workspaceRoot,
      env: selectedEnvironment,
      stdio: 'inherit',
      timeoutMs,
    });
  };

  try {
    if (redisSelected) {
      await runCompose(['up', '-d', '--wait', 'redis'], COMPOSE_STARTUP_TIMEOUT_MS);
    }
    if (closure.provider === 'postgres') {
      await runCompose(['up', '--no-build', '-d', '--wait', 'postgres'], COMPOSE_STARTUP_TIMEOUT_MS);
      await ensureMigratorImage(workspaceRoot, selectedEnvironment);
      await runCompose(['up', '--no-build', 'migrate'], COMPOSE_MIGRATION_TIMEOUT_MS);
    } else {
      await runCompose(['up', '--no-build', '-d', 'mongodb'], COMPOSE_STARTUP_TIMEOUT_MS);
      await runCompose(['up', '--no-build', 'mongodb-init'], COMPOSE_MIGRATION_TIMEOUT_MS);
      await ensureMigratorImage(workspaceRoot, selectedEnvironment);
      await runCompose(['up', '--no-build', 'mongodb-migrate'], COMPOSE_MIGRATION_TIMEOUT_MS);
    }
  } catch (error: unknown) {
    try {
      await runCompose(['down', '--volumes', '--remove-orphans'], COMPOSE_CLEANUP_TIMEOUT_MS);
    } catch (cleanupError: unknown) {
      reportCleanupFailure(cleanupError);
    }
    throw error;
  }

  const runtimeEnvironment = isolatedRuntimeEnvironment({ ...selectedEnvironment });
  delete runtimeEnvironment.CONTAINER_DATABASE_URL;
  if (closure.provider === 'mongodb') {
    runtimeEnvironment.MONGODB_URI = createLocalMongoUri(databasePort, databaseName);
  }

  return {
    runtimeEnvironment,
    stop: async () => {
      await runCompose(['down', '--volumes', '--remove-orphans'], COMPOSE_CLEANUP_TIMEOUT_MS);
    },
  };
}

export function createLocalMongoUri(port: number, databaseName: string): string {
  return `mongodb://mongodb.localhost:${port}/${databaseName}?replicaSet=rs0&retryWrites=true`;
}

async function runSelectedRuntimeSmokes(options: {
  workspaceRoot: string;
  closure: SelectedClosureManifest;
  graph: Parameters<typeof stageDeploymentArtifact>[0]['graph'];
  selection: BunRuntimeSelection;
  environment: NodeJS.ProcessEnv;
}): Promise<void> {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'nrb-runtime-artifacts-'));
  try {
    for (const probe of createBunRuntimeExecutionProbes(options.selection)) {
      const project = probe.project;
      const artifact = stageDeploymentArtifact({
        workspaceRoot: options.workspaceRoot,
        artifactRoot: join(temporaryRoot, project),
        graph: options.graph,
        closure: options.closure,
        project,
      });
      await installDeploymentArtifact(artifact, options.environment);
      for (const runtime of [
        { name: 'node' as const, executable: resolveCanonicalNodeExecutable(options.environment) },
        { name: 'bun' as const, executable: process.execPath },
      ]) {
        if (probe.kind === 'site') await runSiteRuntimeSmoke(artifact, runtime, options.environment);
        else if (probe.kind === 'http') await runApiRuntimeSmoke(artifact, runtime, options.environment);
        else await runHeadlessRuntimeSmoke(artifact, runtime, options.environment);
      }
    }
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

async function installDeploymentArtifact(
  artifact: StagedDeploymentArtifact,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  process.stdout.write(`\n==> pnpm deployment dependency closure: ${artifact.project}\n`);
  const plan = deploymentInstallPlan(artifact);
  const invocation = createNodeBackedPnpmInvocation(plan.args, environment);
  await runBoundedCommand(invocation.command, invocation.args, `${artifact.project} dependency install`, {
    cwd: plan.cwd,
    env: isolatedRuntimeEnvironment(invocation.environment),
    stdio: 'inherit',
    timeoutMs: DEPLOYMENT_INSTALL_TIMEOUT_MS,
  });
}

async function runSiteRuntimeSmoke(
  artifact: StagedDeploymentArtifact,
  runtime: { name: 'node' | 'bun'; executable: string },
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  process.stdout.write(`\n==> ${runtime.name} Vike deployment-artifact smoke\n`);
  const port = await reserveAvailablePort();
  await runHttpRuntime({
    name: artifact.project,
    executable: runtime.executable,
    entry: artifact.entry,
    cwd: artifact.artifactRoot,
    environment: isolatedRuntimeEnvironment({ ...environment, NODE_ENV: 'production', SITE_APP_PORT: String(port) }),
    urls: [`http://127.0.0.1:${port}/health`, `http://127.0.0.1:${port}/`, `http://127.0.0.1:${port}/problems`],
    validate: async (signal) => {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal });
      const body = (await response.json()) as { runtime?: string };
      assertRuntimeIdentity(body.runtime, runtime.name, artifact.project);
    },
  });
}

async function runApiRuntimeSmoke(
  artifact: StagedDeploymentArtifact,
  runtime: { name: 'node' | 'bun'; executable: string },
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  process.stdout.write(
    `\n==> ${runtime.name} ${environment.AUTH_PERSISTENCE} ${artifact.project} startup/readiness/lifecycle probe\n`,
  );
  const port = await reserveAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const readyUrl = `${baseUrl}/ready`;
  await runHttpRuntime({
    name: artifact.project,
    executable: runtime.executable,
    entry: stageApiRuntimeEntry(artifact),
    cwd: artifact.artifactRoot,
    environment: createApiRuntimeEnvironment(artifact.project, environment, port),
    urls: [`${baseUrl}/live`, readyUrl],
    validate: async (signal) => {
      const response = await fetch(readyUrl, { signal });
      const body = (await response.json()) as {
        data?: { checks?: Array<{ name?: string; details?: { runtime?: string } }> };
      };
      const runtimeCheck = body.data?.checks?.find((check) => check.name === 'runtime');
      assertRuntimeIdentity(runtimeCheck?.details?.runtime, runtime.name, artifact.project);
    },
  });
}

export function createApiRuntimeEnvironment(
  project: string,
  environment: NodeJS.ProcessEnv,
  port: number,
): NodeJS.ProcessEnv {
  const provider = environment.AUTH_PERSISTENCE;
  if (provider !== 'postgres' && provider !== 'mongodb') {
    throw new Error(`${project} runtime probe requires an explicit PostgreSQL or MongoDB provider.`);
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const smokeCredential = ['runtime', 'compat', 'only', '9d6aQ3w7K2m8V5x1R4t0'].join('-');
  const portEnvironmentName = `${project.replaceAll(/[^a-z0-9]/giu, '_').toUpperCase()}_PORT`;
  const runtimeEnvironment = isolatedRuntimeEnvironment({
    ...environment,
    PORT: String(port),
    [portEnvironmentName]: String(port),
    GRACEFUL_SHUTDOWN: 'true',
    SESSION_SECRET: smokeCredential,
    AUTH_PERSISTENCE: provider,
    DATABASE_ENGINE: provider,
    BETTER_AUTH_SECRET: smokeCredential,
    BETTER_AUTH_URL: baseUrl,
    BETTER_AUTH_TRUSTED_ORIGINS: baseUrl,
    AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED: 'false',
    AUTH_TELEGRAM_ENABLED: 'false',
    DISCORD_CLIENT_ID: 'runtime-compat-discord-client',
    DISCORD_CLIENT_SECRET: smokeCredential,
    DISCORD_REDIRECT_URI: `${baseUrl}/auth/discord/callback`,
    DISCORD_APPLICATION_ID: '123456789012345678',
    DISCORD_BOT_TOKEN: '',
    DISCORD_PUBLIC_KEY: 'a'.repeat(64),
    DISCORD_CUSTOM_ID_SECRET: smokeCredential,
    DISCORD_COMMAND_REGISTRATION_ENABLED: 'false',
    TELEGRAM_BOT_TOKEN: '123:runtime-compat-token',
    TELEGRAM_BOT_MODE: 'webhook',
    TELEGRAM_BOT_MENU_BUTTON_ENABLED: 'false',
    TELEGRAM_BOT_WEBHOOK_SECRET: smokeCredential,
    TELEGRAM_BOT_WEBHOOK_URL: 'https://telegram-bot-api.example.test/telegram/webhook',
    TELEGRAM_OIDC_ENABLED: 'false',
    NODE_ENV: 'production',
    OPENAPI_ENABLED: 'true',
    OTEL_ENABLED: 'false',
    OTEL_SDK_DISABLED: 'true',
    RATE_LIMIT_STORE: 'memory',
    RATE_LIMIT_IN_MEMORY_ALLOWED: 'true',
  });
  delete runtimeEnvironment.NATS_SERVERS;
  return runtimeEnvironment;
}

function stageApiRuntimeEntry(artifact: StagedDeploymentArtifact): string {
  if (artifact.project !== 'telegram-bot-api') return artifact.entry;
  const entry = join(artifact.artifactRoot, 'telegram-api-runtime-mock.cjs');
  writeFileSync(entry, createTelegramApiMockSource(artifact.entry));
  return entry;
}

export function createTelegramApiMockSource(runtimeEntry: string): string {
  return `'use strict';
const { createRequire } = require('node:module');
const runtimeRequire = createRequire(${JSON.stringify(runtimeEntry)});
const grammyRequire = createRequire(runtimeRequire.resolve('grammy'));
const nodeFetch = grammyRequire('node-fetch');
const createTelegramFetch = (originalFetch) => async (input, init) => {
  const requestUrl = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const pathPrefix = token ? \`/bot\${token}/\` : '';
  if (requestUrl.origin !== 'https://api.telegram.org' || !pathPrefix || !requestUrl.pathname.startsWith(pathPrefix)) {
    return originalFetch(input, init);
  }
  const method = requestUrl.pathname.slice(pathPrefix.length);
  const result = method === 'getMe'
    ? {
        id: 42,
        is_bot: true,
        first_name: 'Runtime Compatibility Bot',
        username: 'runtime_compat_bot',
        can_join_groups: false,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      }
    : method === 'setWebhook'
      ? true
      : undefined;
  if (result === undefined) throw new Error(\`Unexpected Telegram Bot API method during runtime compatibility: \${method}\`);
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
globalThis.fetch = createTelegramFetch(globalThis.fetch);
nodeFetch.default = createTelegramFetch(nodeFetch.default);
require(${JSON.stringify(runtimeEntry)});
`;
}

async function runHeadlessRuntimeSmoke(
  artifact: StagedDeploymentArtifact,
  runtime: { name: 'node' | 'bun'; executable: string },
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  process.stdout.write(`\n==> ${runtime.name} ${artifact.project} startup/lifecycle process probe\n`);
  const child = spawn(runtime.executable, [artifact.entry], {
    cwd: artifact.artifactRoot,
    env: createHeadlessRuntimeEnvironment(environment),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
    process.stderr.write(chunk);
  });
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (childHasExited(child)) throw new Error(`${artifact.project} exited before application-context startup.`);
      if (output.includes('Application context successfully started')) {
        assertRuntimeIdentity(runtimeFromProcessOutput(output), runtime.name, artifact.project);
        return;
      }
      await delay(100);
    }
    throw new Error(`${artifact.project} application-context startup timed out.`);
  } finally {
    await stopChild(child);
  }
}

export function createHeadlessRuntimeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return isolatedRuntimeEnvironment({
    ...environment,
    NODE_ENV: 'production',
    OTEL_ENABLED: 'false',
    OTEL_SDK_DISABLED: 'true',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: '00'.repeat(32),
    RESEND_API_KEY: 'bun-test-key',
    NOTIFICATION_EMAIL_FROM: 'Bun Compatibility <bun-compat@example.test>',
    S3_ENDPOINT: '',
    S3_ACCESS_KEY: '',
    S3_SECRET_KEY: '',
  });
}

interface HttpRuntimeOptions {
  name: string;
  executable: string;
  entry: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  urls: readonly string[];
  validate?: (signal: AbortSignal) => Promise<void>;
}

async function runHttpRuntime(options: HttpRuntimeOptions): Promise<void> {
  if (!existsSync(options.entry)) throw new Error(`${options.name} runtime entry is missing: ${options.entry}`);
  const child = spawn(options.executable, [options.entry], {
    cwd: options.cwd,
    env: isolatedRuntimeEnvironment(options.environment),
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
  });
  try {
    await waitForUrls(child, options.urls);
    await options.validate?.(AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MS));
  } finally {
    await stopChild(child);
  }
}

export async function waitForUrls(
  child: Pick<ChildProcess, 'exitCode' | 'signalCode'>,
  urls: readonly string[],
  options: { readyTimeoutMs?: number; requestTimeoutMs?: number } = {},
): Promise<void> {
  const readyTimeoutMs = options.readyTimeoutMs ?? HTTP_RUNTIME_READY_TIMEOUT_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? HTTP_REQUEST_TIMEOUT_MS;
  const deadline = Date.now() + readyTimeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (childHasExited(child)) throw new Error(`Runtime process exited before becoming ready with code ${child.exitCode}.`);
    try {
      for (const url of urls) {
        const remainingMs = Math.max(1, deadline - Date.now());
        const response = await fetch(url, {
          signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
        });
        if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      await delay(Math.min(250, Math.max(1, deadline - Date.now())));
    }
  }
  throw new Error(`Runtime smoke timed out: ${errorMessage(lastError)}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (processTreeHasExited(child)) return;
  signalChildProcessTree(child, 'SIGTERM');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (processTreeHasExited(child)) return;
    await delay(100);
  }
  signalChildProcessTree(child, 'SIGKILL');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processTreeHasExited(child)) return;
    await delay(100);
  }
  throw new Error('Runtime probe child did not stop after SIGTERM; SIGKILL was required for cleanup.');
}

export function childHasExited(child: Pick<ChildProcess, 'exitCode' | 'signalCode'>): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

export function assertRuntimeIdentity(
  actual: string | undefined,
  expected: 'bun' | 'node',
  project: string,
): void {
  if (actual !== expected) {
    throw new Error(`${project} did not report runtime=${expected}; received ${actual ?? 'no runtime identity'}.`);
  }
}

function runtimeFromProcessOutput(output: string): string | undefined {
  return output.match(/Application context successfully started \(runtime=(bun|node)\)/u)?.[1];
}

function processTreeHasExited(child: ChildProcess): boolean {
  if (process.platform === 'win32' || !child.pid) {
    return childHasExited(child);
  }
  try {
    process.kill(-child.pid, 0);
    return false;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export async function runBoundedCommand(
  program: string,
  args: readonly string[],
  description: string,
  options: BoundedCommandOptions,
): Promise<void> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`${description} requires a positive finite timeout.`);
  }
  const terminationGraceMs = options.terminationGraceMs ?? COMMAND_TERMINATION_GRACE_MS;
  const forceKillWaitMs = options.forceKillWaitMs ?? COMMAND_FORCE_KILL_WAIT_MS;
  if (!Number.isFinite(terminationGraceMs) || terminationGraceMs < 0) {
    throw new Error(`${description} requires a finite non-negative termination grace period.`);
  }
  if (!Number.isFinite(forceKillWaitMs) || forceKillWaitMs < 0) {
    throw new Error(`${description} requires a finite non-negative force-kill wait.`);
  }

  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(program, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? 'inherit',
      detached: process.platform !== 'win32',
    });
    const timeoutError = new Error(`${description} timed out after ${options.timeoutMs}ms.`);
    let timedOut = false;
    let forceKillSent = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let forceKillWaitTimer: NodeJS.Timeout | undefined;

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      signalChildProcessTree(child, 'SIGTERM');
      forceKillTimer = setTimeout(() => {
        forceKillSent = true;
        signalChildProcessTree(child, 'SIGKILL');
        forceKillWaitTimer = setTimeout(() => finish(timeoutError), forceKillWaitMs);
      }, terminationGraceMs);
    }, options.timeoutMs);

    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (forceKillWaitTimer) clearTimeout(forceKillWaitTimer);
      if (error) rejectCommand(error);
      else resolveCommand();
    };

    child.once('error', finish);
    child.once('close', (code, signal) => {
      if (timedOut) {
        if (forceKillSent) {
          finish(timeoutError);
        }
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      finish(new Error(`${description} failed with exit code ${code ?? signal ?? 1}.`));
    });
  });
}

function signalChildProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const taskkill = spawn(
      'taskkill',
      ['/pid', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])],
      { stdio: 'ignore', windowsHide: true },
    );
    taskkill.once('error', () => {
      child.kill(signal);
    });
    taskkill.unref();
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    if (!childHasExited(child)) {
      child.kill(signal);
    }
  }
}

async function reserveAvailablePort(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Unable to reserve a local runtime-smoke port.'));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportCleanupFailure(error: unknown): void {
  process.stderr.write(`Bun compatibility cleanup also failed: ${errorMessage(error)}\n`);
}
