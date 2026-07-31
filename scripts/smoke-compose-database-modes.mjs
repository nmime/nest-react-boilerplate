#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateNormalizedClosureContext } from './closure-build-context.mjs';

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
const bundledMongoProject = `nrbmongobundled${suffix}`;
const externalMongoProject = `nrbmongoexternal${suffix}`;
const externalContainer = `nrb-external-postgres-${suffix}`;
const externalMongoContainer = `nrb-external-mongodb-${suffix}`;
const tempDir = mkdtempSync(join(tmpdir(), 'nrb-compose-modes-'));
const postgresClosureContext = validateNormalizedClosureContext(join(rootDir, '.nrb/reference/postgres'));
const mongodbClosureContext = validateNormalizedClosureContext(join(rootDir, '.nrb/reference/mongodb'));
let activeClosureContext = postgresClosureContext;
const sessionSecretPath = join(tempDir, 'session_secret.txt');
const betterAuthSecretPath = join(tempDir, 'better_auth_secret.txt');
const authProviderEncryptionKeyPath = join(tempDir, 'auth_provider_token_encryption_key.txt');
const notificationPayloadEncryptionKeyPath = join(tempDir, 'notification_payload_encryption_key.txt');
const resendApiKeyPath = join(tempDir, 'resend_api_key.txt');
const mailPaceServerTokenPath = join(tempDir, 'mailpace_server_token.txt');
const redisPasswordPath = join(tempDir, 'redis_password.txt');
const postgresPasswordPath = join(tempDir, 'postgres_password.txt');
const databaseUrlPath = join(tempDir, 'database_url.txt');
const mongodbRootPasswordPath = join(tempDir, 'mongodb_root_password.txt');
const mongodbPasswordPath = join(tempDir, 'mongodb_password.txt');
const mongodbMigrationPasswordPath = join(tempDir, 'mongodb_migration_password.txt');
const mongodbBackupRestorePasswordPath = join(tempDir, 'mongodb_backup_restore_password.txt');
const mongodbKeyfilePath = join(tempDir, 'mongodb_keyfile.txt');
const mongodbUriPath = join(tempDir, 'mongodb_uri.txt');
const mongodbMigrationUriPath = join(tempDir, 'mongodb_migration_uri.txt');
const mongodbBackupRestoreUriPath = join(tempDir, 'mongodb_backup_restore_uri.txt');
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
const externalMongoUri = `mongodb://${externalMongoContainer}:27017/${databaseName}?replicaSet=rs0&retryWrites=true`;
const externalMongoBackupRestoreUri = `mongodb://${externalMongoContainer}:27017/?authSource=admin&replicaSet=rs0&retryWrites=true`;

for (const [path, value] of [
  [sessionSecretPath, runtimeSecret()],
  [betterAuthSecretPath, runtimeSecret()],
  [authProviderEncryptionKeyPath, randomBytes(32).toString('base64')],
  [notificationPayloadEncryptionKeyPath, randomBytes(32).toString('base64')],
  [resendApiKeyPath, ''],
  [mailPaceServerTokenPath, ''],
  [redisPasswordPath, runtimeSecret()],
  [postgresPasswordPath, databasePassword],
  [databaseUrlPath, externalDatabaseUrl.toString()],
  [mongodbRootPasswordPath, runtimeSecret()],
  [mongodbPasswordPath, runtimeSecret()],
  [mongodbMigrationPasswordPath, runtimeSecret()],
  [mongodbBackupRestorePasswordPath, runtimeSecret()],
  [mongodbKeyfilePath, randomBytes(64).toString('base64')],
  [mongodbUriPath, externalMongoUri],
  [mongodbMigrationUriPath, externalMongoUri],
  [mongodbBackupRestoreUriPath, externalMongoBackupRestoreUri],
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
const bundledMongoFiles = [
  ...baseFiles,
  '-f',
  'docker/docker-compose.prod.mongodb-bundled-db.yml',
  ...sourceBuildFiles,
];
const externalMongoFiles = [
  ...baseFiles,
  '-f',
  'docker/docker-compose.prod.mongodb-external-db.yml',
  ...sourceBuildFiles,
];
const commonEnv = {
  ...process.env,
  SESSION_SECRET_FILE: sessionSecretPath,
  BETTER_AUTH_SECRET_FILE: betterAuthSecretPath,
  AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE: authProviderEncryptionKeyPath,
  NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE: notificationPayloadEncryptionKeyPath,
  RESEND_API_KEY_FILE: resendApiKeyPath,
  MAILPACE_SERVER_TOKEN_FILE: mailPaceServerTokenPath,
  REDIS_PASSWORD_FILE: redisPasswordPath,
  POSTGRES_PASSWORD_FILE: postgresPasswordPath,
  DATABASE_URL_FILE: databaseUrlPath,
  MONGODB_ROOT_PASSWORD_FILE: mongodbRootPasswordPath,
  MONGODB_PASSWORD_FILE: mongodbPasswordPath,
  MONGODB_MIGRATION_PASSWORD_FILE: mongodbMigrationPasswordPath,
  MONGODB_BACKUP_RESTORE_PASSWORD_FILE: mongodbBackupRestorePasswordPath,
  MONGODB_KEYFILE_FILE: mongodbKeyfilePath,
  MONGODB_URI_FILE: mongodbUriPath,
  MONGODB_MIGRATION_URI_FILE: mongodbMigrationUriPath,
  MONGODB_BACKUP_RESTORE_URI_FILE: mongodbBackupRestoreUriPath,
  MONGODB_USER: databaseUser,
  MONGODB_DATABASE: databaseName,
  MONGODB_REPLICA_SET: 'rs0',
  GRAFANA_ADMIN_PASSWORD_FILE: grafanaPasswordPath,
  CORS_ORIGINS: 'https://example.com',
  AUTH_ALLOWED_RETURN_URLS: 'https://example.com',
  IMAGE_REGISTRY: `nrb-deployment-smoke-${suffix}`,
  IMAGE_TAG: 'sha-0123456789abcdef0123456789abcdef01234567',
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  POSTGRES_DB: databaseName,
  // The disposable external PostgreSQL container does not expose a TLS endpoint.
  POSTGRES_SSL: 'false',
  OTEL_ENABLED: 'false',
  COMPOSE_PARALLEL_LIMIT: '1',
  COMPOSE_BAKE: 'false',
  NX_DAEMON: 'false',
  NX_PARALLEL: '1',
};

const run = (args, options = {}) => {
  const result = spawnSync('docker', args, {
    cwd: rootDir,
    env: { ...commonEnv, NRB_CLOSURE_CONTEXT: activeClosureContext },
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
let bundledMongoStarted = false;
try {
  console.log('building production PostgreSQL migrator from its provider reference context');
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

  activeClosureContext = mongodbClosureContext;
  console.log('building production MongoDB migrator from its provider reference context');
  compose(bundledMongoProject, bundledMongoFiles, ['build', 'migrate']);
  console.log('smoke: bundled transaction-capable MongoDB topology');
  bundledMongoStarted = true;
  // Let MongoDB consume its full health retry budget before Compose evaluates mongodb-init.
  compose(bundledMongoProject, bundledMongoFiles, ['up', '--no-build', '-d', 'mongodb']);
  await waitFor('bundled MongoDB startup', () => {
    const containerId = compose(bundledMongoProject, bundledMongoFiles, ['ps', '--all', '--quiet', 'mongodb'], {
      capture: true,
    });
    if (!containerId) return 'container missing';
    const state = run(
      [
        'inspect',
        '--format',
        '{{.State.Status}}:{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}:{{.State.ExitCode}}',
        containerId,
      ],
      { capture: true },
    );
    return state === 'running:healthy:0' ? 'ready' : state;
  });
  compose(bundledMongoProject, bundledMongoFiles, ['up', '--no-build', '-d', 'mongodb-init']);
  await waitFor('bundled MongoDB preparation', () => {
    const containerId = compose(bundledMongoProject, bundledMongoFiles, ['ps', '--all', '--quiet', 'mongodb-init'], {
      capture: true,
    });
    if (!containerId) return 'container missing';
    const state = run(['inspect', '--format', '{{.State.Status}}:{{.State.ExitCode}}', containerId], { capture: true });
    if (state === 'exited:0') return 'ready';
    if (state.startsWith('exited:')) throw new Error(`mongodb-init failed with ${state}`);
    return state;
  });
  compose(bundledMongoProject, bundledMongoFiles, ['run', '--rm', '--no-deps', 'migrate']);

  console.log('smoke: external MongoDB replica-set topology');
  compose(externalMongoProject, externalMongoFiles, ['create', '--no-build', 'migrate']);
  run([
    'run',
    '--detach',
    '--name',
    externalMongoContainer,
    '--network',
    `${externalMongoProject}_app`,
    'mongo:8.0.12-noble',
    '--replSet',
    'rs0',
    '--bind_ip_all',
  ]);
  await waitFor('external MongoDB startup', () => {
    const result = spawnSync(
      'docker',
      ['exec', externalMongoContainer, 'mongosh', '--quiet', '--eval', 'quit(db.adminCommand({ ping: 1 }).ok ? 0 : 1)'],
      { cwd: rootDir, env: commonEnv, stdio: 'ignore' },
    );
    return result.status === 0 ? 'ready' : 'starting';
  });
  run([
    'exec',
    externalMongoContainer,
    'mongosh',
    '--quiet',
    '--eval',
    `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '${externalMongoContainer}:27017' }] })`,
  ]);
  await waitFor('external MongoDB primary', () => {
    const result = spawnSync(
      'docker',
      ['exec', externalMongoContainer, 'mongosh', '--quiet', '--eval', 'quit(db.hello().isWritablePrimary ? 0 : 1)'],
      { cwd: rootDir, env: commonEnv, stdio: 'ignore' },
    );
    return result.status === 0 ? 'ready' : 'electing';
  });
  compose(externalMongoProject, externalMongoFiles, ['run', '--rm', '--no-deps', 'migrate']);

  console.log(
    JSON.stringify({
      status: 'ok',
      engines: ['postgres', 'mongodb'],
      ownership: ['bundled-db', 'external-db'],
      migrations: 4,
    }),
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
  if (bundledMongoStarted) {
    console.error('bundled MongoDB service logs:');
    spawnSync(
      'docker',
      [
        'compose',
        '--project-name',
        bundledMongoProject,
        ...bundledMongoFiles,
        'logs',
        '--no-color',
        '--tail',
        '200',
        'mongodb',
        'mongodb-init',
      ],
      {
        cwd: rootDir,
        env: { ...commonEnv, NRB_CLOSURE_CONTEXT: mongodbClosureContext },
        stdio: 'inherit',
      },
    );
  }
} finally {
  // Disconnect the independently owned database before Compose removes its
  // application network; otherwise Docker correctly reports the network busy.
  spawnSync('docker', ['rm', '--force', externalContainer], { cwd: rootDir, stdio: 'ignore' });
  spawnSync('docker', ['rm', '--force', externalMongoContainer], { cwd: rootDir, stdio: 'ignore' });
  for (const [project, files] of [
    [bundledProject, bundledFiles],
    [externalProject, externalFiles],
    [bundledMongoProject, bundledMongoFiles],
    [externalMongoProject, externalMongoFiles],
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
