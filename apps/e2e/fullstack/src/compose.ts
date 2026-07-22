import { spawn } from 'node:child_process';

const composeParallelLimit = process.env.COMPOSE_PARALLEL_LIMIT ?? '2';
export const composeArgs = ['compose', '--parallel', composeParallelLimit, '-f', 'docker/docker-compose.yml'];
export const stackServices = [
  'migrate',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'admin-app',
  'user-app',
  'landing-app',
];

const host = process.env.FULLSTACK_HOST ?? '127.0.0.1';
const stableHash = (value: string): number =>
  [...value].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 5381);
const fallbackRunId = stableHash(process.cwd()).toString(36);
const generatedPortBase =
  Number.parseInt(process.env.DOCKER_TEST_PORT_BASE ?? '', 10) || 40_000 + (stableHash(process.cwd()) % 8_000);
const pickPort = (envName: string, offset: number): string =>
  process.env[envName] ?? String(generatedPortBase + offset);
const ports = {
  postgres: pickPort('POSTGRES_PORT', 0),
  adminApi: pickPort('ADMIN_APP_API_PORT', 1),
  userApi: pickPort('USER_APP_API_PORT', 2),
  authApi: pickPort('AUTH_APP_API_PORT', 3),
  adminApp: pickPort('ADMIN_APP_PORT', 81),
  userApp: pickPort('USER_APP_PORT', 82),
  landingApp: pickPort('LANDING_APP_PORT', 83),
};
const url = (port: string, path = '') => `http://${host}:${port}${path}`;
const frontendOrigins = [ports.adminApp, ports.userApp, ports.landingApp].map((port) => url(port)).join(',');

const writeStdoutLine = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeStderrLine = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

export const composeEnv = {
  ...process.env,
  COMPOSE_PROFILES:
    process.env.COMPOSE_PROFILES ?? ['postgres', ...stackServices.filter((service) => service !== 'migrate')].join(','),
  COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME ?? `nrbfullstack${fallbackRunId}`,
  POSTGRES_PORT: ports.postgres,
  ADMIN_APP_API_PORT: ports.adminApi,
  USER_APP_API_PORT: ports.userApi,
  AUTH_APP_API_PORT: ports.authApi,
  ADMIN_APP_PORT: ports.adminApp,
  USER_APP_PORT: ports.userApp,
  LANDING_APP_PORT: ports.landingApp,
  // Cap parallel targets rather than serializing the full stack. Docker shares
  // the dependency layers across this one invocation, so two builders is a
  // useful default without exhausting a typical CI runner.
  COMPOSE_PARALLEL_LIMIT: composeParallelLimit,
  COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? 'false',
  DATABASE_URL: process.env.DOCKER_DATABASE_URL ?? 'postgres://postgres:postgres@postgres:5432/nest_react_boilerplate',
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? '1',
  HOST: process.env.DOCKER_BACKEND_HOST ?? '0.0.0.0',
  NX_DAEMON: 'false',
  NX_PARALLEL: process.env.NX_PARALLEL ?? '1',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? frontendOrigins,
  USER_APP_URL: process.env.USER_APP_URL ?? url(ports.userApp),
  FULLSTACK_BASE_URL: process.env.FULLSTACK_BASE_URL ?? url(ports.userApp),
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'fullstack-e2e-session-secret-change-me',
  // The isolated full-stack lane intentionally starts no Redis service. Keep
  // rate limiting enabled, but explicitly permit the test-only in-memory store.
  RATE_LIMIT_STORE: process.env.RATE_LIMIT_STORE ?? 'memory',
  RATE_LIMIT_IN_MEMORY_ALLOWED: process.env.RATE_LIMIT_IN_MEMORY_ALLOWED ?? 'true',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'fullstack-e2e-better-auth-secret-change-me',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? url(ports.userApp),
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? url(ports.userApp),
  AUTH_TELEGRAM_ENABLED: process.env.AUTH_TELEGRAM_ENABLED ?? 'true',
  EXTERNAL_AUTH_AUTO_PROVISION_ENABLED: process.env.EXTERNAL_AUTH_AUTO_PROVISION_ENABLED ?? 'true',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '123456789:test-bot-token',
  TELEGRAM_TMA_MAX_AGE_SECONDS: process.env.TELEGRAM_TMA_MAX_AGE_SECONDS ?? '300',
  VITE_TELEGRAM_AUTH_ENABLED: process.env.VITE_TELEGRAM_AUTH_ENABLED ?? 'true',
  ADMIN_BOOTSTRAP_EMAILS: process.env.ADMIN_BOOTSTRAP_EMAILS ?? 'admin@example.com',
  ADMIN_BOOTSTRAP_ENABLED: process.env.ADMIN_BOOTSTRAP_ENABLED ?? 'true',
};

export const urls = {
  adminApi: url(ports.adminApi),
  userApi: url(ports.userApi),
  authApi: url(ports.authApi),
  adminApp: url(ports.adminApp),
  userApp: url(ports.userApp),
  landingApp: url(ports.landingApp),
};

const stackUpArgs = [...composeArgs, 'up', '--no-build', '-d', ...stackServices];

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
  try {
    await run('docker', stackUpArgs);
  } catch (error) {
    writeStderrLine(
      `docker compose up reported a transient startup failure; retrying once: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await run('docker', stackUpArgs);
  }
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
