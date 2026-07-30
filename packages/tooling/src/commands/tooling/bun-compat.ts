import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
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
import { providerExternalPackages, type SelectedClosureManifest } from '../../setup/closure.js';
import { appCatalog } from '../../setup/catalog.js';

export interface BunCompatibilityProbe {
  name: string;
  nxArgs: readonly string[];
  runtime?: 'bun' | 'node';
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
  if (testProjects.length > 0) {
    probes.push({
      name: 'Selected closure unit tests',
      nxArgs: ['run-many', '-t', 'test', `--projects=${testProjects.join(',')}`, '--parallel=1', '--skip-nx-cache'],
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

    for (const probe of createBunCompatibilityProbes(closure)) {
      process.stdout.write(`\n==> ${probe.name}\n`);
      const command = createBunCompatibilityInvocation(probe, environment, process.execPath);
      const result = spawnSync(command.program, command.args, {
        cwd: context.workspaceRoot,
        env: command.environment,
        stdio: 'inherit',
      });
      if (result.status !== 0) throw new Error(`${probe.name} failed with exit code ${result.status ?? 1}.`);
    }

    if (selection.projects.length > 0) {
      await buildCanonicalDeploymentArtifacts(context.workspaceRoot, selection.projects, environment);
    }
    const infrastructure = await startSelectedInfrastructure(context.workspaceRoot, closure, environment);
    try {
      await runSelectedRuntimeSmokes({
        workspaceRoot: context.workspaceRoot,
        closure,
        graph,
        selection,
        environment: { ...environment, ...infrastructure.runtimeEnvironment },
      });
    } finally {
      await infrastructure.stop();
    }
  } catch (error: unknown) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }

  process.stdout.write('\nBun compatibility contract passed.\n');
  return 0;
}

export function createBunCompatibilityInvocation(
  probe: BunCompatibilityProbe,
  environment: NodeJS.ProcessEnv,
  bunExecutable: string,
): BunCompatibilityInvocation {
  const probeEnvironment = { ...environment };
  if (probe.runtime === 'node') {
    delete probeEnvironment.BUN_BE_BUN;
    return {
      program: 'node',
      args: ['node_modules/nx/dist/bin/nx.js', ...probe.nxArgs],
      environment: probeEnvironment,
    };
  }

  return {
    program: bunExecutable,
    args: ['run', '--bun', 'nx', ...probe.nxArgs],
    environment: probeEnvironment,
  };
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
): NodeBackedPnpmInvocation {
  const pnpmExecutable = executableOnPath('pnpm', environment);
  const nodeExecutable = resolveCanonicalNodeExecutable(environment, pnpmExecutable);
  return { command: nodeExecutable, args: [pnpmExecutable, ...args] };
}

export function resolveCanonicalNodeExecutable(
  environment: NodeJS.ProcessEnv = process.env,
  pnpmExecutable = executableOnPath('pnpm', environment),
): string {
  const siblingNode = join(dirname(pnpmExecutable), 'node');
  return existsSync(siblingNode) ? siblingNode : executableOnPath('node', environment);
}

function executableOnPath(name: string, environment: NodeJS.ProcessEnv): string {
  const executable = environment.PATH?.split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, name))
    .find((candidate) => existsSync(candidate));
  if (!executable) throw new Error(`${name} is required on PATH for deployment dependency installation.`);
  return executable;
}

function compatibilityEnvironment(): NodeJS.ProcessEnv {
  const environment = isolatedRuntimeEnvironment({
    ...process.env,
    CI: process.env.CI ?? 'true',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://compat:compat@127.0.0.1:1/compat',
    MONGODB_DATABASE: process.env.MONGODB_DATABASE ?? 'compat',
    MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:1/compat',
    NX_DAEMON: 'false',
    VITE_API_BASE_URL_MODE: 'same-origin',
  });
  delete environment.NO_COLOR;
  delete environment.FORCE_COLOR;
  return environment;
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
  const result = spawnSync(
    resolveCanonicalNodeExecutable(environment),
    [
      join(workspaceRoot, 'node_modules/nx/dist/bin/nx.js'),
      'run-many',
      '-t',
      'build',
      `--projects=${projects.join(',')}`,
      '--skip-nx-cache',
    ],
    { cwd: workspaceRoot, env: environment, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`Canonical deployment build failed with exit code ${result.status ?? 1}.`);
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
  if (spawnSync('docker', ['compose', 'version'], { cwd: workspaceRoot, stdio: 'ignore' }).status !== 0) {
    throw new Error(`Docker Compose is required for the ${closure.provider} Bun runtime probe.`);
  }

  const projectName = `nrbbun${closure.provider}${process.pid}`;
  const databasePort = await reserveAvailablePort();
  const compose = ['compose', '--project-name', projectName, '-f', 'docker/docker-compose.yml'];
  const databaseName = 'nest_react_boilerplate';
  const selectedEnvironment = isolatedRuntimeEnvironment({
    ...environment,
    COMPOSE_PROJECT_NAME: projectName,
    COMPOSE_PROFILES: closure.provider,
    NRB_CLOSURE_CONTEXT: join(workspaceRoot, '.nrb/closure'),
    DATABASE_ENGINE: closure.provider,
    AUTH_PERSISTENCE: closure.provider,
  });
  for (const key of [
    'DATABASE_URL',
    'CONTAINER_DATABASE_URL',
    'POSTGRES_PORT',
    'MONGODB_URI',
    'MONGODB_DATABASE',
    'MONGODB_REPLICA_SET',
    'MONGODB_PORT',
  ]) {
    delete selectedEnvironment[key];
  }
  if (closure.provider === 'postgres') {
    Object.assign(selectedEnvironment, {
      POSTGRES_PORT: String(databasePort),
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${databasePort}/${databaseName}`,
      CONTAINER_DATABASE_URL: `postgres://postgres:postgres@postgres:5432/${databaseName}`,
    });
  } else {
    Object.assign(selectedEnvironment, {
      MONGODB_PORT: String(databasePort),
      MONGODB_URI: `mongodb://mongodb.localhost:27017/${databaseName}?replicaSet=rs0&retryWrites=true`,
      MONGODB_DATABASE: databaseName,
      MONGODB_REPLICA_SET: 'rs0',
    });
  }
  const runCompose = (args: string[]) => {
    const result = spawnSync('docker', [...compose, ...args], {
      cwd: workspaceRoot,
      env: selectedEnvironment,
      stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error(`docker ${[...compose, ...args].join(' ')} failed with ${result.status ?? 1}.`);
  };

  try {
    if (closure.provider === 'postgres') {
      runCompose(['up', '--build', '-d', '--wait', 'postgres']);
      runCompose(['run', '--build', '--rm', '--no-deps', 'migrate']);
    } else {
      runCompose(['up', '--build', '-d', 'mongodb']);
      runCompose(['run', '--rm', '--no-deps', 'mongodb-init']);
      runCompose(['run', '--build', '--rm', '--no-deps', 'mongodb-migrate']);
    }
  } catch (error) {
    spawnSync('docker', [...compose, 'down', '--volumes', '--remove-orphans'], {
      cwd: workspaceRoot,
      env: selectedEnvironment,
      stdio: 'inherit',
    });
    throw error;
  }

  const runtimeEnvironment = isolatedRuntimeEnvironment({ ...selectedEnvironment });
  delete runtimeEnvironment.CONTAINER_DATABASE_URL;
  if (closure.provider === 'mongodb') {
    runtimeEnvironment.MONGODB_URI =
      `mongodb://mongodb.localhost:${databasePort}/${databaseName}?replicaSet=rs0&retryWrites=true`;
  }

  return {
    runtimeEnvironment,
    stop: async () => {
      const result = spawnSync('docker', [...compose, 'down', '--volumes', '--remove-orphans'], {
        cwd: workspaceRoot,
        env: selectedEnvironment,
        stdio: 'inherit',
      });
      if (result.status !== 0) throw new Error(`Bun runtime database cleanup failed with ${result.status ?? 1}.`);
    },
  };
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
      installDeploymentArtifact(artifact, options.environment);
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

function installDeploymentArtifact(artifact: StagedDeploymentArtifact, environment: NodeJS.ProcessEnv): void {
  process.stdout.write(`\n==> pnpm deployment dependency closure: ${artifact.project}\n`);
  const plan = deploymentInstallPlan(artifact);
  const invocation = createNodeBackedPnpmInvocation(plan.args, environment);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: plan.cwd,
    env: isolatedRuntimeEnvironment(environment),
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${artifact.project} dependency install failed with ${result.status ?? 1}.`);
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
  const smokeCredential = ['runtime', 'compat', 'only', '9d6aQ3w7K2m8V5x1R4t0'].join('-');
  const provider = environment.AUTH_PERSISTENCE;
  if (provider !== 'postgres' && provider !== 'mongodb') {
    throw new Error(`${artifact.project} runtime probe requires an explicit PostgreSQL or MongoDB provider.`);
  }
  const portEnvironmentName = `${artifact.project.replaceAll(/[^a-z0-9]/giu, '_').toUpperCase()}_PORT`;
  await runHttpRuntime({
    name: artifact.project,
    executable: runtime.executable,
    entry: artifact.entry,
    cwd: artifact.artifactRoot,
    environment: isolatedRuntimeEnvironment({
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
      REDIS_URL: '',
      NATS_SERVERS: '',
    }),
    urls: [`${baseUrl}/live`, readyUrl],
    validate: async () => {
      const response = await fetch(readyUrl);
      const body = (await response.json()) as {
        data?: { checks?: Array<{ name?: string; details?: { runtime?: string } }> };
      };
      const runtimeCheck = body.data?.checks?.find((check) => check.name === 'runtime');
      if (runtimeCheck?.details?.runtime !== runtime.name) {
        throw new Error(`${artifact.project} readiness did not report runtime=${runtime.name}.`);
      }
    },
  });
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
      if (output.includes('Application context successfully started')) return;
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
  validate?: () => Promise<void>;
}

async function runHttpRuntime(options: HttpRuntimeOptions): Promise<void> {
  if (!existsSync(options.entry)) throw new Error(`${options.name} runtime entry is missing: ${options.entry}`);
  const child = spawn(options.executable, [options.entry], {
    cwd: options.cwd,
    env: isolatedRuntimeEnvironment(options.environment),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    await waitForUrls(child, options.urls);
    await options.validate?.();
  } finally {
    await stopChild(child);
  }
}

async function waitForUrls(child: ChildProcess, urls: readonly string[]): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (childHasExited(child)) throw new Error(`Runtime process exited before becoming ready with code ${child.exitCode}.`);
    try {
      for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`Runtime smoke timed out: ${errorMessage(lastError)}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (childHasExited(child)) return;
  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (childHasExited(child)) return;
    await delay(100);
  }
  child.kill('SIGKILL');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (childHasExited(child)) return;
    await delay(100);
  }
  throw new Error('Runtime probe child did not stop after SIGTERM; SIGKILL was required for cleanup.');
}

export function childHasExited(child: Pick<ChildProcess, 'exitCode' | 'signalCode'>): boolean {
  return child.exitCode !== null || child.signalCode !== null;
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
