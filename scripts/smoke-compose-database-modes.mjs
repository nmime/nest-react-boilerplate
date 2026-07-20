#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dockerAvailable =
  process.env.SKIP_DOCKER_TESTS !== 'true' &&
  spawnSync('docker', ['compose', 'version'], { cwd: rootDir, stdio: 'ignore' }).status === 0;
if (!dockerAvailable) {
  console.warn('production Compose database smoke skipped because Docker Compose is unavailable');
  process.exit(0);
}

const suffix = `${process.pid}${Date.now().toString().slice(-6)}`;
const bundledProject = `nrbbundled${suffix}`;
const externalProject = `nrbexternal${suffix}`;
const externalContainer = `nrb-external-postgres-${suffix}`;
const tempDir = mkdtempSync(join(tmpdir(), 'nrb-compose-modes-'));
const authSecretPath = join(tempDir, 'auth_jwt_secret.txt');
const sessionSecretPath = join(tempDir, 'session_secret.txt');
const betterAuthSecretPath = join(tempDir, 'better_auth_secret.txt');
const authProviderEncryptionKeyPath = join(tempDir, 'auth_provider_token_encryption_key.txt');
const redisPasswordPath = join(tempDir, 'redis_password.txt');
const postgresPasswordPath = join(tempDir, 'postgres_password.txt');
const databaseUrlPath = join(tempDir, 'database_url.txt');
const grafanaPasswordPath = join(tempDir, 'grafana_admin_password.txt');
const databaseUser = 'nrb_smoke';
const runtimeSecret = () => randomBytes(32).toString('base64url');
const databasePassword = runtimeSecret();
const databaseName = 'nrb_smoke';
const externalDatabaseUrl = new URL('postgresql://external-database');
externalDatabaseUrl.username = databaseUser;
externalDatabaseUrl.password = databasePassword;
externalDatabaseUrl.hostname = externalContainer;
externalDatabaseUrl.port = '5432';
externalDatabaseUrl.pathname = databaseName;

for (const [path, value] of [
  [authSecretPath, runtimeSecret()],
  [sessionSecretPath, runtimeSecret()],
  [betterAuthSecretPath, runtimeSecret()],
  [authProviderEncryptionKeyPath, randomBytes(32).toString('base64')],
  [redisPasswordPath, runtimeSecret()],
  [postgresPasswordPath, databasePassword],
  [databaseUrlPath, externalDatabaseUrl.toString()],
  [grafanaPasswordPath, runtimeSecret()],
]) {
  writeFileSync(path, `${value}\n`, { mode: 0o600 });
}

const baseFiles = ['-f', 'docker/docker-compose.prod.yml'];
// This smoke test intentionally builds the migration image from source. Normal
// production invocations use the image-only base through compose-production.
const sourceBuildFiles = ['-f', 'docker/docker-compose.prod.build.yml'];
const bundledFiles = [...baseFiles, '-f', 'docker/docker-compose.prod.bundled-db.yml', ...sourceBuildFiles];
const externalFiles = [...baseFiles, '-f', 'docker/docker-compose.prod.external-db.yml', ...sourceBuildFiles];
const commonEnv = {
  ...process.env,
  AUTH_JWT_SECRET_FILE: authSecretPath,
  SESSION_SECRET_FILE: sessionSecretPath,
  BETTER_AUTH_SECRET_FILE: betterAuthSecretPath,
  AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE: authProviderEncryptionKeyPath,
  REDIS_PASSWORD_FILE: redisPasswordPath,
  POSTGRES_PASSWORD_FILE: postgresPasswordPath,
  DATABASE_URL_FILE: databaseUrlPath,
  GRAFANA_ADMIN_PASSWORD_FILE: grafanaPasswordPath,
  CORS_ORIGINS: 'https://example.com',
  AUTH_ALLOWED_RETURN_URLS: 'https://example.com',
  IMAGE_REGISTRY: `nrb-deployment-smoke-${suffix}`,
  IMAGE_TAG: 'sha-0123456789abcdef0123456789abcdef01234567',
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  POSTGRES_DB: databaseName,
  OTEL_ENABLED: 'false',
  COMPOSE_PARALLEL_LIMIT: '1',
  COMPOSE_BAKE: 'false',
  NX_DAEMON: 'false',
  NX_PARALLEL: '1',
};

const run = (args, options = {}) => {
  const result = spawnSync('docker', args, {
    cwd: rootDir,
    env: commonEnv,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
  });
  if (result.status !== 0) {
    if (options.capture) process.stderr.write(result.stderr ?? '');
    throw new Error(`docker ${args.join(' ')} exited with ${result.status ?? 'unknown status'}`);
  }
  return options.capture ? (result.stdout ?? '').trim() : '';
};

const compose = (project, files, args, options) =>
  run(['compose', '--project-name', project, ...files, ...args], options);

const waitFor = async (label, check) => {
  const deadline = Date.now() + 120_000;
  let last = 'not ready';
  while (Date.now() < deadline) {
    try {
      const value = check();
      if (value === 'healthy' || value === 'ready') return;
      last = value || last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new Error(`${label} did not become ready: ${last}`);
};

let exitCode = 0;
try {
  console.log('building production migrator image once for both database modes');
  compose(bundledProject, bundledFiles, ['build', 'migrate']);
  const runtimeUid = compose(
    bundledProject,
    bundledFiles,
    ['run', '--rm', '--no-deps', 'migrate', 'node', '-p', 'process.getuid()'],
    { capture: true },
  );
  assert.equal(runtimeUid, '1000', 'the secret-loading entrypoint must drop to the non-root node user');

  console.log('smoke: bundled PostgreSQL topology');
  compose(bundledProject, bundledFiles, ['up', '--no-build', '-d', 'postgres']);
  await waitFor('bundled PostgreSQL', () => {
    const containerId = compose(bundledProject, bundledFiles, ['ps', '--quiet', 'postgres'], { capture: true });
    if (!containerId) return 'container missing';
    return run(['inspect', '--format', '{{.State.Health.Status}}', containerId], { capture: true });
  });
  compose(bundledProject, bundledFiles, ['run', '--rm', '--no-deps', 'migrate']);

  console.log('smoke: external PostgreSQL topology');
  run([
    'run',
    '--detach',
    '--name',
    externalContainer,
    '--env',
    'POSTGRES_USER',
    '--env',
    'POSTGRES_PASSWORD',
    '--env',
    'POSTGRES_DB',
    'postgres:17.6-alpine',
  ]);
  compose(externalProject, externalFiles, ['create', '--no-build', 'migrate']);
  run(['network', 'connect', `${externalProject}_app`, externalContainer]);
  await waitFor('external PostgreSQL', () => {
    const result = spawnSync(
      'docker',
      ['exec', externalContainer, 'pg_isready', '-U', databaseUser, '-d', databaseName],
      { cwd: rootDir, env: commonEnv, stdio: 'ignore' },
    );
    return result.status === 0 ? 'ready' : 'starting';
  });
  compose(externalProject, externalFiles, ['run', '--rm', '--no-deps', 'migrate']);

  console.log(JSON.stringify({ status: 'ok', modes: ['bundled-db', 'external-db'], migrations: 2 }));
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  // Disconnect the independently owned database before Compose removes its
  // application network; otherwise Docker correctly reports the network busy.
  spawnSync('docker', ['rm', '--force', externalContainer], { cwd: rootDir, stdio: 'ignore' });
  for (const [project, files] of [
    [bundledProject, bundledFiles],
    [externalProject, externalFiles],
  ]) {
    try {
      compose(project, files, ['down', '--volumes', '--remove-orphans']);
    } catch {
      // Best-effort cleanup after a failed smoke step.
    }
  }
  rmSync(tempDir, { recursive: true, force: true });
}

process.exit(exitCode);
