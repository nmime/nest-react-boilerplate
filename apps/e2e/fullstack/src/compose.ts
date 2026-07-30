import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readFullstackSelection, validateFullstackEnvironment } from './selection';

const composeParallelLimit = process.env.COMPOSE_PARALLEL_LIMIT ?? '2';
export const composeArgs = ['compose', '--parallel', composeParallelLimit, '-f', 'docker/docker-compose.yml'];
const workspaceRoot = process.env.NRB_WORKSPACE_ROOT ?? process.cwd();
const forceManageLocalStack = process.env.PLAYWRIGHT_MANAGE_STACK === '1';

const host = process.env.FULLSTACK_HOST ?? '127.0.0.1';
const stableHash = (value: string): number =>
  [...value].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5381);
const fallbackRunId = stableHash(workspaceRoot).toString(36);
const generatedPortBase =
  Number.parseInt(process.env.DOCKER_TEST_PORT_BASE ?? '', 10) || 40_000 + (stableHash(workspaceRoot) % 8_000);
const pickPort = (envName: string, offset: number): string =>
  process.env[envName] ?? String(generatedPortBase + offset);
const ports = {
  postgres: pickPort('POSTGRES_PORT', 0),
  mongodb: pickPort('MONGODB_PORT', 0),
  adminApi: pickPort('ADMIN_APP_API_PORT', 1),
  userApi: pickPort('USER_APP_API_PORT', 2),
  authApi: pickPort('AUTH_APP_API_PORT', 3),
  adminApp: pickPort('ADMIN_APP_PORT', 81),
  userApp: pickPort('USER_APP_PORT', 82),
  landingApp: pickPort('LANDING_APP_PORT', 83),
  siteApp: pickPort('SITE_APP_PORT', 84),
};
const url = (port: string, path = '') => `http://${host}:${port}${path}`;
const normalizeConfiguredUrl = (name: string, value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }

  return parsed.toString().replace(/\/$/u, '');
};
const configuredUrl = (names: string[], fallback: string): string => {
  if (forceManageLocalStack) {
    return fallback;
  }
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return normalizeConfiguredUrl(name, value);
    }
  }

  return fallback;
};
const frontendOrigins = [ports.adminApp, ports.userApp, ports.landingApp, ports.siteApp]
  .map((port) => url(port))
  .join(',');

export const urls = {
  adminApi: configuredUrl(['FULLSTACK_ADMIN_API_URL', 'ADMIN_APP_API_URL'], url(ports.adminApi)),
  userApi: configuredUrl(['FULLSTACK_USER_API_URL', 'USER_APP_API_URL'], url(ports.userApi)),
  authApi: configuredUrl(['FULLSTACK_AUTH_API_URL', 'AUTH_APP_API_URL'], url(ports.authApi)),
  adminApp: configuredUrl(['FULLSTACK_ADMIN_APP_URL', 'ADMIN_APP_URL'], url(ports.adminApp)),
  userApp: configuredUrl(
    ['FULLSTACK_USER_APP_URL', 'USER_APP_URL', 'FULLSTACK_BASE_URL', 'PLAYWRIGHT_BASE_URL'],
    url(ports.userApp),
  ),
  landingApp: configuredUrl(['FULLSTACK_LANDING_APP_URL', 'LANDING_APP_URL'], url(ports.landingApp)),
  siteApp: configuredUrl(['FULLSTACK_SITE_APP_URL', 'SITE_APP_URL'], url(ports.siteApp)),
};

const externalUrlGroups = [
  ['FULLSTACK_ADMIN_API_URL', 'ADMIN_APP_API_URL'],
  ['FULLSTACK_USER_API_URL', 'USER_APP_API_URL'],
  ['FULLSTACK_AUTH_API_URL', 'AUTH_APP_API_URL'],
  ['FULLSTACK_ADMIN_APP_URL', 'ADMIN_APP_URL'],
  ['FULLSTACK_USER_APP_URL', 'USER_APP_URL', 'FULLSTACK_BASE_URL', 'PLAYWRIGHT_BASE_URL'],
  ['FULLSTACK_LANDING_APP_URL', 'LANDING_APP_URL'],
  ['FULLSTACK_SITE_APP_URL', 'SITE_APP_URL'],
] as const;

export function assertExternalStackUrlsConfigured(): void {
  const missing = externalUrlGroups
    .filter((names) => !names.some((name) => process.env[name]?.trim()))
    .map((names) => names[0]);
  if (missing.length > 0) {
    throw new Error(`External Playwright mode requires explicit per-service URLs: ${missing.join(', ')}`);
  }
}

export function hasExternalStackUrlConfiguration(): boolean {
  return externalUrlGroups.some((names) => names.some((name) => process.env[name]?.trim()));
}

const managesLocalStack =
  forceManageLocalStack || (!hasExternalStackUrlConfiguration() && process.env.PLAYWRIGHT_MANAGE_STACK !== '0');
export const fullstackSelection = managesLocalStack ? readFullstackSelection(workspaceRoot) : undefined;
if (fullstackSelection) {
  validateFullstackEnvironment(fullstackSelection, process.env);
}
export const databaseProvider = fullstackSelection?.provider;
const applicationServices = fullstackSelection?.applicationServices ?? [];
export const stackServices = fullstackSelection?.services ?? [];

const writeStdoutLine = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeStderrLine = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const selectedEnvironment = { ...process.env };

export const composeEnv = {
  ...selectedEnvironment,
  COMPOSE_PROFILES: fullstackSelection?.profiles.join(',') ?? process.env.COMPOSE_PROFILES,
  COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME ?? `nrbfullstack${fallbackRunId}`,
  POSTGRES_PORT: ports.postgres,
  MONGODB_PORT: ports.mongodb,
  ADMIN_APP_API_PORT: ports.adminApi,
  USER_APP_API_PORT: ports.userApi,
  AUTH_APP_API_PORT: ports.authApi,
  ADMIN_APP_PORT: ports.adminApp,
  USER_APP_PORT: ports.userApp,
  LANDING_APP_PORT: ports.landingApp,
  SITE_APP_PORT: ports.siteApp,
  // Cap parallel targets rather than serializing the full stack. Docker shares
  // the dependency layers across this one invocation, so two builders is a
  // useful default without exhausting a typical CI runner.
  COMPOSE_PARALLEL_LIMIT: composeParallelLimit,
  COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? 'false',
  NRB_CLOSURE_CONTEXT: join(workspaceRoot, '.nrb/closure'),
  DATABASE_ENGINE: databaseProvider,
  AUTH_PERSISTENCE: databaseProvider,
  DATABASE_URL:
    databaseProvider === 'postgres'
      ? (selectedEnvironment.DOCKER_DATABASE_URL ??
        selectedEnvironment.DATABASE_URL ??
        'postgres://postgres:postgres@postgres:5432/nest_react_boilerplate')
      : undefined,
  CONTAINER_DATABASE_URL:
    databaseProvider === 'postgres'
      ? (selectedEnvironment.DOCKER_DATABASE_URL ?? 'postgres://postgres:postgres@postgres:5432/nest_react_boilerplate')
      : undefined,
  MONGODB_URI:
    databaseProvider === 'mongodb'
      ? (selectedEnvironment.DOCKER_MONGODB_URI ??
        selectedEnvironment.MONGODB_URI ??
        'mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0&retryWrites=true')
      : undefined,
  MONGODB_DATABASE:
    databaseProvider === 'mongodb' ? (selectedEnvironment.MONGODB_DATABASE ?? 'nest_react_boilerplate') : undefined,
  MONGODB_REPLICA_SET: databaseProvider === 'mongodb' ? (selectedEnvironment.MONGODB_REPLICA_SET ?? 'rs0') : undefined,
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? '1',
  HOST: process.env.DOCKER_BACKEND_HOST ?? '0.0.0.0',
  NX_DAEMON: 'false',
  NX_PARALLEL: process.env.NX_PARALLEL ?? '1',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? frontendOrigins,
  USER_APP_URL: urls.userApp,
  FULLSTACK_BASE_URL: urls.userApp,
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'fullstack-e2e-session-secret-change-me',
  // The isolated full-stack lane intentionally starts no Redis service. Keep
  // rate limiting enabled, but explicitly permit the test-only in-memory store.
  RATE_LIMIT_STORE: process.env.RATE_LIMIT_STORE ?? 'memory',
  RATE_LIMIT_IN_MEMORY_ALLOWED: process.env.RATE_LIMIT_IN_MEMORY_ALLOWED ?? 'true',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'fullstack-e2e-better-auth-secret-change-me',
  NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
    process.env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY ?? 'fullstack-e2e-notification-key-change-me',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? urls.userApp,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? urls.userApp,
  AUTH_TELEGRAM_ENABLED: process.env.AUTH_TELEGRAM_ENABLED ?? 'true',
  EXTERNAL_AUTH_AUTO_PROVISION_ENABLED: process.env.EXTERNAL_AUTH_AUTO_PROVISION_ENABLED ?? 'true',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '123456789:test-bot-token',
  TELEGRAM_TMA_MAX_AGE_SECONDS: process.env.TELEGRAM_TMA_MAX_AGE_SECONDS ?? '300',
  VITE_TELEGRAM_AUTH_ENABLED: process.env.VITE_TELEGRAM_AUTH_ENABLED ?? 'true',
  ADMIN_BOOTSTRAP_EMAILS: process.env.ADMIN_BOOTSTRAP_EMAILS ?? 'admin@example.com',
  ADMIN_BOOTSTRAP_ENABLED: process.env.ADMIN_BOOTSTRAP_ENABLED ?? 'true',
};

export const stackIncludes = (service: string): boolean =>
  fullstackSelection === undefined || applicationServices.includes(service);
const stackUpArgs = [...composeArgs, 'up', '--no-build', '-d', ...stackServices];
const mongoInitCommand = `
set -euo pipefail
bash /opt/mongodb/prepare-replica-set.sh
mongosh 'mongodb://mongodb:27017/admin?directConnection=true' --quiet --eval '
  const config = rs.conf();
  if (config.members[0].host !== "mongodb.localhost:27017") {
    config.members[0].host = "mongodb.localhost:27017";
    rs.reconfig(config);
  }
'
until mongosh 'mongodb://mongodb:27017/admin?directConnection=true' --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'; do sleep 2; done
`;

export function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: composeEnv });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
  });
}

export async function upStack(): Promise<void> {
  const startStack = async (): Promise<void> => {
    if (databaseProvider === 'mongodb') {
      await run('docker', [...composeArgs, 'up', '--no-build', '-d', 'mongodb']);
      // Bind-mounted scripts can lose their executable bit on some runners.
      await run('docker', [
        ...composeArgs,
        'run',
        '--rm',
        '--no-deps',
        '--entrypoint',
        'bash',
        'mongodb-init',
        '-c',
        mongoInitCommand,
      ]);
      await run('docker', [...composeArgs, 'run', '--rm', '--no-deps', 'mongodb-migrate']);
      const remainingServices = stackServices.filter(
        (service) => !['mongodb', 'mongodb-init', 'mongodb-migrate'].includes(service),
      );
      if (remainingServices.length > 0) {
        await run('docker', [...composeArgs, 'up', '--no-build', '-d', ...remainingServices]);
      }
      return;
    }
    await run('docker', stackUpArgs);
  };

  try {
    await startStack();
  } catch (error) {
    writeStderrLine(
      `docker compose up reported a transient startup failure; retrying once: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await startStack();
  }
}

export async function configureLandingDestinations(): Promise<void> {
  const runtimeConfig = `window.__APP_RUNTIME_CONFIG__ = ${JSON.stringify({
    adminAppUrl: urls.adminApp,
    userAppUrl: urls.userApp,
  })};`;
  await run('docker', [
    ...composeArgs,
    'exec',
    '-T',
    '--user',
    '0',
    'landing-app',
    'sh',
    '-c',
    'printf "%s\\n" "$1" > /usr/share/nginx/html/runtime-config.js',
    'sh',
    runtimeConfig,
  ]);
}

export async function buildStackImages(): Promise<void> {
  writeStdoutLine(`fullstack compose project=${composeEnv.COMPOSE_PROJECT_NAME} ports=${JSON.stringify(ports)}`);
  await buildServices(stackServices);
}

async function buildServices(services: string[]): Promise<void> {
  const args = [...composeArgs, 'build', ...services];
  try {
    await run('docker', args);
  } catch (error) {
    writeStderrLine(
      `docker compose parallel build reported a transient failure; retrying once: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await run('docker', args);
  }
}

export async function waitForText(label: string, url: string, contains: string): Promise<void> {
  const started = Date.now();
  let lastError = 'not attempted';
  while (Date.now() - started < 180_000) {
    try {
      // eslint-disable-next-line no-await-in-loop -- readiness polling is sequential by design
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      // eslint-disable-next-line no-await-in-loop -- readiness polling is sequential by design
      const text = await response.text();
      if (response.ok && text.includes(contains)) {
        writeStdoutLine(`${label}: ok (${response.status})`);
        return;
      }
      lastError = response.ok
        ? `${response.status} missing expected text`
        : `${response.status} ${response.statusText || 'request failed'}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    // eslint-disable-next-line no-await-in-loop -- readiness polling is sequential by design
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`${label} did not become ready: ${lastError}`);
}
