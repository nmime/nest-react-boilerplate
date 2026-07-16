#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(rootDir, path), 'utf8');
const basePath = 'docker/docker-compose.prod.yml';
const bundledPath = 'docker/docker-compose.prod.bundled-db.yml';
const externalPath = 'docker/docker-compose.prod.external-db.yml';
const base = read(basePath);
const bundled = read(bundledPath);
const external = read(externalPath);
const secretEntrypoint = read('docker/secret-entrypoint.sh');
const databaseConsumers = [
  'migrate',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
];

assert.ok(!base.includes('\n  postgres:\n'), 'The production base Compose file must not select a database topology.');
assert.ok(
  secretEntrypoint.includes('load_secret DATABASE_URL /run/secrets/database_url'),
  'The production entrypoint must load the external database URL secret.',
);
assert.ok(
  secretEntrypoint.includes('load_secret POSTGRES_PASSWORD /run/secrets/postgres_password'),
  'The production entrypoint must load the bundled PostgreSQL secret.',
);
assert.ok(
  secretEntrypoint.includes('exec su-exec node "$@"'),
  'The production entrypoint must drop privileges before running application commands.',
);
assert.ok(bundled.includes('\n  postgres:\n'), 'Bundled-db overlay must define PostgreSQL.');
assert.ok(bundled.includes('postgres-data:'), 'Bundled-db overlay must persist PostgreSQL data.');
assert.ok(bundled.includes('postgres_password:'), 'Bundled-db overlay must define the PostgreSQL password secret.');
assert.ok(!external.includes('\n  postgres:\n'), 'External-db overlay must not define PostgreSQL.');
assert.ok(external.includes('database_url:'), 'External-db overlay must define the database URL secret.');
assert.ok(external.includes('DATABASE_URL_FILE'), 'External-db overlay must expose a configurable secret-file path.');
for (const service of databaseConsumers) {
  assert.ok(bundled.includes(`  ${service}:`), `Bundled-db overlay must wire ${service}.`);
  assert.ok(external.includes(`  ${service}:`), `External-db overlay must wire ${service}.`);
}

const dockerAvailable = spawnSync('docker', ['compose', 'version'], { cwd: rootDir, stdio: 'ignore' }).status === 0;
if (!dockerAvailable) {
  if (process.env.REQUIRE_DOCKER_COMPOSE === 'true') {
    console.error('Docker Compose is required for deployment mode validation but is unavailable.');
    process.exit(127);
  }
  console.log('compose mode static assertions passed; Docker Compose render skipped because it is unavailable');
  process.exit(0);
}

const render = (overlayPath) => {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      basePath,
      '-f',
      overlayPath,
      '--profile',
      'discord',
      '--profile',
      'telegram',
      'config',
      '--format',
      'json',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        CORS_ORIGINS: 'https://example.com',
        IMAGE_TAG: 'sha-0123456789abcdef0123456789abcdef01234567',
      },
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
};

const secretNames = (service) => (service.secrets ?? []).map((secret) => secret.source ?? secret);
const networkNames = (service) =>
  Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});
const bundledModel = render(bundledPath);
const externalModel = render(externalPath);

assert.ok(bundledModel.services.postgres, 'Bundled-db render must include PostgreSQL.');
assert.ok(!externalModel.services.postgres, 'External-db render must exclude PostgreSQL.');
assert.ok(bundledModel.volumes['postgres-data'], 'Bundled-db render must include the PostgreSQL volume.');
assert.ok(!externalModel.volumes['postgres-data'], 'External-db render must exclude the PostgreSQL volume.');
assert.ok(bundledModel.secrets.postgres_password, 'Bundled-db render must include postgres_password.');
assert.ok(!bundledModel.secrets.database_url, 'Bundled-db render must not include database_url.');
assert.ok(externalModel.secrets.database_url, 'External-db render must include database_url.');
assert.ok(!externalModel.secrets.postgres_password, 'External-db render must not include postgres_password.');

for (const service of databaseConsumers) {
  const bundledService = bundledModel.services[service];
  const externalService = externalModel.services[service];
  assert.ok(
    secretNames(bundledService).includes('postgres_password'),
    `${service} must mount postgres_password in bundled mode.`,
  );
  assert.ok(
    !secretNames(bundledService).includes('database_url'),
    `${service} must not mount database_url in bundled mode.`,
  );
  assert.ok(
    secretNames(externalService).includes('database_url'),
    `${service} must mount database_url in external mode.`,
  );
  assert.ok(
    !secretNames(externalService).includes('postgres_password'),
    `${service} must not mount postgres_password in external mode.`,
  );
  assert.ok(bundledService.depends_on?.postgres, `${service} must wait for PostgreSQL in bundled mode.`);
  assert.ok(
    !externalService.depends_on?.postgres,
    `${service} must not depend on a Compose PostgreSQL service in external mode.`,
  );
  assert.ok(
    !Object.hasOwn(externalService.environment ?? {}, 'DATABASE_URL'),
    `${service} must receive DATABASE_URL from a secret, not the Compose model.`,
  );
}

assert.ok(
  networkNames(externalModel.services.migrate).includes('app'),
  'External-db migration service needs an egress-capable network.',
);

console.log(
  JSON.stringify({
    status: 'ok',
    modes: {
      bundledDb: { postgres: true, services: Object.keys(bundledModel.services).length },
      externalDb: { postgres: false, services: Object.keys(externalModel.services).length },
    },
  }),
);
