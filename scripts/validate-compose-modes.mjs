#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { buildComposeInvocation } from './compose-production.mjs';
import { normalizedClosureContextFiles } from './closure-build-context.mjs';
import { parseDeclaredSecrets } from './declared-secrets.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url);
const { renderClosureCaddyfile, renderClosureSingleDomainCaddyfile } = await jiti.import(
  '../packages/tooling/src/setup/closure-materializer.ts',
);
const read = (path) => readFileSync(join(rootDir, path), 'utf8');
const base = read('docker/docker-compose.prod.yml');
const bundled = read('docker/docker-compose.prod.bundled-db.yml');
const external = read('docker/docker-compose.prod.external-db.yml');
const bundledMongo = read('docker/docker-compose.prod.mongodb-bundled-db.yml');
const externalMongo = read('docker/docker-compose.prod.mongodb-external-db.yml');
const redis = read('docker/docker-compose.prod.redis.yml');
const telegram = read('docker/docker-compose.prod.telegram.yml');
const discord = read('docker/docker-compose.prod.discord.yml');
const edge = read('docker/docker-compose.prod.edge.yml');
const providedTls = read('docker/docker-compose.prod.edge-provided-tls.yml');
const secretEntrypoint = read('docker/secret-entrypoint.sh');
const mongoEntrypoint = read('docker/mongodb/start-authenticated-replica-set.sh');
const mongoProductionUsers = read('docker/mongodb/create-production-user.js');
const developmentCompose = read('docker/docker-compose.yml');
const developmentMongoInitializer = read('docker/mongodb/prepare-replica-set.sh');
const databaseConsumers = [
  'migrate',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'notification-scheduler',
  'notification-consumer',
];
const productionApps = [
  'admin-app',
  'admin-app-api',
  'auth-app-api',
  'discord-app-api',
  'landing-app',
  'mobile-app',
  'notification-consumer',
  'notification-scheduler',
  'site-app',
  'telegram-bot-api',
  'user-app',
  'user-app-api',
];
const productionClosure = (provider, profiles, apps, services) => {
  const selectedOptionalApps = profiles.map((profile) =>
    profile === 'discord' ? 'discord-app-api' : profile === 'telegram' ? 'telegram-bot-api' : profile,
  );
  const selectedApps =
    apps ??
    productionApps.filter(
      (app) =>
        !['discord-app-api', 'notification-consumer', 'notification-scheduler', 'telegram-bot-api'].includes(app) ||
        selectedOptionalApps.includes(app),
    );
  return {
    edgeCaddyfiles: {
      'per-app-domains': closureCaddyfileFixture,
      'single-domain': closureSingleDomainCaddyfileFixture,
    },
    provider,
    releaseImages: [...(provider ? ['migrator'] : []), ...selectedApps].sort(),
    roots: [...selectedApps].sort(),
    selectedApps: [...selectedApps].sort(),
    services: (
      services ??
      (provider === 'postgres'
        ? ['migrate', 'postgres', 'redis']
        : provider === 'mongodb'
          ? ['mongodb', 'mongodb-init', 'mongodb-migrate', 'redis']
          : [])
    ).sort(),
  };
};

assert.ok(!base.includes('\n  postgres:\n'), 'The production base Compose file must not select a database topology.');
assert.ok(!base.includes('\n  mongodb:\n'), 'The production base Compose file must not select a database topology.');
assert.ok(!base.includes('\n  redis:\n'), 'The production base Compose file must not include unselected Redis.');
assert.ok(!base.includes('      redis:\n'), 'The production base Compose file must not depend on unselected Redis.');
assert.ok(redis.includes('\n  redis:\n'), 'The Redis overlay must define Redis.');
// Assert on the entrypoint's parsed manifest, not on its rendered load_secret lines: the manifest
// is the single enumeration and this validator must derive from it rather than restate it.
const declaredSecretVariables = new Map(
  parseDeclaredSecrets(secretEntrypoint).map(({ secret, variable }) => [secret, variable]),
);
for (const [secret, variable, reason] of [
  ['database_url', 'DATABASE_URL', 'the external database URL secret'],
  ['postgres_password', 'POSTGRES_PASSWORD', 'the bundled PostgreSQL secret'],
  ['mongodb_uri', 'MONGODB_URI', 'the external MongoDB URI'],
  ['mongodb_migration_uri', 'MONGODB_URI', 'the MongoDB migration URI alias'],
  ['mongodb_password', 'MONGODB_PASSWORD', 'the bundled MongoDB password'],
  ['mongodb_migration_password', 'MONGODB_PASSWORD', 'the MongoDB migration password alias'],
  ['session_secret', 'SESSION_SECRET', 'the session secret'],
  ['auth_provider_token_encryption_key', 'AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY', 'the provider-token key'],
  ['redis_password', 'REDIS_PASSWORD', 'the Redis password'],
]) {
  assert.equal(declaredSecretVariables.get(secret), variable, `The production entrypoint must load ${reason}.`);
}
assert.ok(
  secretEntrypoint.includes('exec su-exec 1000:1000 "$@"'),
  'The production entrypoint must drop privileges before running application commands.',
);
assert.ok(
  secretEntrypoint.includes('if has_declared_docker_secret; then'),
  'A non-root process must fail closed only for declared Docker secrets.',
);
assert.ok(bundled.includes('\n  postgres:\n'), 'Bundled-db overlay must define PostgreSQL.');
assert.ok(bundled.includes('postgres-data:'), 'Bundled-db overlay must persist PostgreSQL data.');
assert.ok(bundled.includes('postgres_password:'), 'Bundled-db overlay must define the PostgreSQL password secret.');
assert.ok(!external.includes('\n  postgres:\n'), 'External-db overlay must not define PostgreSQL.');
assert.ok(external.includes('database_url:'), 'External-db overlay must define the database URL secret.');
assert.ok(external.includes('DATABASE_URL_FILE'), 'External-db overlay must expose a configurable secret-file path.');
assert.ok(bundledMongo.includes('\n  mongodb:\n'), 'Bundled MongoDB overlay must define MongoDB.');
assert.ok(mongoEntrypoint.includes('--replSet'), 'Bundled MongoDB must use a replica set.');
assert.ok(bundledMongo.includes('mongodb_keyfile'), 'Bundled MongoDB must use keyfile authentication.');
assert.ok(bundledMongo.includes('mongodb-init:'), 'Bundled MongoDB must define idempotent preparation.');
assert.ok(
  developmentCompose.includes("'${MONGODB_PORT:-27017}:${MONGODB_PORT:-27017}'"),
  'Development MongoDB must publish the selected port to the same container port.',
);
assert.ok(
  developmentCompose.includes("'--port', '${MONGODB_PORT:-27017}'"),
  'Development mongod must listen on the selected port.',
);
assert.ok(
  developmentCompose.includes("entrypoint: ['bash', '/opt/mongodb/prepare-replica-set.sh']"),
  'Development MongoDB initialization must use the canonical checked initializer.',
);
for (const required of [
  'set -euo pipefail',
  'MONGODB_INIT_TIMEOUT_SECONDS',
  'readonly deadline=',
  'timeout --foreground --kill-after=2s',
  "retry_before_deadline 'replica-set preparation'",
  "retry_before_deadline 'replica-set member reconfiguration'",
  "retry_before_deadline 'primary readiness'",
  '--file /opt/mongodb/transaction-smoke.js',
]) {
  assert.ok(
    developmentMongoInitializer.includes(required),
    `Development MongoDB initializer missing bounded checked step: ${required}`,
  );
}
for (const role of ["'readWrite'", "'dbAdmin'", "'backup'", "'restore'"]) {
  assert.ok(mongoProductionUsers.includes(`role: ${role}`), `Bundled MongoDB must provision the ${role} role.`);
}
assert.ok(mongoProductionUsers.includes("actions: ['anyAction']"), 'MongoDB oplog replay requires anyAction.');
assert.ok(mongoProductionUsers.includes('anyResource: true'), 'MongoDB oplog replay requires anyResource privileges.');
assert.ok(!externalMongo.includes('\n  mongodb:\n'), 'External MongoDB overlay must not define MongoDB.');
assert.ok(externalMongo.includes('mongodb_uri:'), 'External MongoDB overlay must define its URI secret.');
assert.ok(externalMongo.includes('mongodb_migration_uri:'), 'External MongoDB must define its migration URI secret.');
assert.ok(
  externalMongo.includes('mongodb_backup_restore_uri:'),
  'External MongoDB must define its backup/restore URI secret.',
);
assert.ok(telegram.includes('AUTH_TELEGRAM_ENABLED'), 'Telegram overlay must enable tenant Telegram auth.');
assert.ok(telegram.includes('TELEGRAM_OIDC_ENABLED'), 'Telegram overlay must enable Better Auth Telegram OIDC.');
assert.ok(telegram.includes('telegram_bot_token'), 'Telegram overlay must mount the TMA signature secret.');
assert.ok(telegram.includes('telegram_oidc_client_secret'), 'Telegram overlay must mount the OIDC client secret.');
assert.ok(discord.includes('DISCORD_AUTH_ENABLED'), 'Discord overlay must enable Discord auth.');
assert.ok(discord.includes('discord_client_secret'), 'Discord overlay must mount the OAuth client secret.');
assert.ok(base.includes('AUTH_ALLOWED_RETURN_URLS'), 'Production services must receive the auth return URL allowlist.');
assert.ok(edge.includes('caddy:2.11.4-alpine'), 'The public edge image must be pinned.');
assert.ok(edge.includes('cap_drop: [ALL]'), 'The public edge must drop ambient Linux capabilities.');
assert.ok(edge.includes('no-new-privileges:true'), 'The public edge must prevent privilege escalation.');
assert.ok(providedTls.includes('EDGE_TLS_CERT_FILE'), 'Provided TLS mode must mount a certificate file.');
assert.ok(providedTls.includes('EDGE_TLS_KEY_FILE'), 'Provided TLS mode must mount a private-key file.');
for (const [secret, variable, reason] of [
  ['better_auth_secret', 'BETTER_AUTH_SECRET', 'the Better Auth secret'],
  ['telegram_oidc_client_secret', 'TELEGRAM_OIDC_CLIENT_SECRET', 'the Telegram OIDC client secret'],
  ['discord_client_secret', 'DISCORD_CLIENT_SECRET', 'the Discord OAuth client secret'],
]) {
  assert.equal(declaredSecretVariables.get(secret), variable, `The production entrypoint must load ${reason}.`);
}
for (const service of databaseConsumers) {
  assert.ok(bundled.includes(`  ${service}:`), `Bundled-db overlay must wire ${service}.`);
  assert.ok(external.includes(`  ${service}:`), `External-db overlay must wire ${service}.`);
  assert.ok(bundledMongo.includes(`  ${service}:`), `Bundled MongoDB overlay must wire ${service}.`);
  assert.ok(externalMongo.includes(`  ${service}:`), `External MongoDB overlay must wire ${service}.`);
}
const dockerAvailable =
  process.env.SKIP_DOCKER_TESTS !== 'true' &&
  spawnSync('docker', ['compose', 'version'], { cwd: rootDir, stdio: 'ignore' }).status === 0;
if (!dockerAvailable) {
  if (process.env.REQUIRE_DOCKER_COMPOSE === 'true') {
    console.error('Docker Compose is required for deployment mode validation but is unavailable.');
    process.exit(127);
  }
  console.log('compose mode static assertions passed; Docker Compose render skipped because it is unavailable');
  process.exit(0);
}

const missingContext = spawnSync(
  'docker',
  ['compose', '-f', 'docker/docker-compose.yml', '--profile', 'landing-app', 'config'],
  {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, NRB_CLOSURE_CONTEXT: '' },
  },
);
assert.notEqual(missingContext.status, 0, 'Direct Compose source builds must reject a missing nrb-closure context.');
assert.match(
  `${missingContext.stderr ?? ''}${missingContext.stdout ?? ''}`,
  /NRB_CLOSURE_CONTEXT/u,
  'Missing source-build context failure must identify NRB_CLOSURE_CONTEXT.',
);

const render = ({
  apps,
  database,
  domains,
  engine = 'postgres',
  environment = {},
  profiles = [],
  services,
  sourceBuild = false,
  tls,
}) => {
  const arguments_ = [
    'config',
    '--env-file=.env.production.example',
    ...(database ? [`--database=${database}`] : []),
    ...(engine ? [`--engine=${engine}`] : []),
    `--domains=${domains}`,
    `--tls=${tls}`,
    ...profiles.map((profile) => `--profile=${profile}`),
    ...(sourceBuild ? ['--source-build'] : []),
    '--format',
    'json',
  ];
  const invocation = buildComposeInvocation(
    arguments_,
    {
      ...process.env,
      IMAGE_TAG: 'sha-0123456789abcdef0123456789abcdef01234567',
      TELEGRAM_OIDC_CLIENT_ID: '123456789',
      MONGODB_REPLICA_SET: 'rs0',
      MONGODB_URI_FILE: mongoUriFile,
      MONGODB_MIGRATION_URI_FILE: mongoMigrationUriFile,
      MONGODB_BACKUP_RESTORE_URI_FILE: mongoBackupRestoreUriFile,
      ...(engine ? {} : { COMPOSE_DATABASE_MODE: '', DATABASE_ENGINE: '' }),
      ...environment,
    },
    {
      readProductionClosure: () => productionClosure(engine || null, profiles, apps, services),
      resolveSelectedProductClosureContext: () => closureContextFixture,
    },
  );
  const result = spawnSync('docker', invocation.args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: invocation.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(
      `Compose fixture failed: provider=${engine || 'none'}, database=${database || 'none'}, apps=${(apps ?? ['default']).join(',')}\n`,
    );
    process.stderr.write(result.stderr ?? result.stdout ?? 'Docker Compose render failed.\n');
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
};

const secretNames = (service) => (service.secrets ?? []).map((secret) => secret.source ?? secret);
const networkNames = (service) =>
  Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});
const volumeTargets = (service) => (service.volumes ?? []).map((volume) => volume.target ?? volume);

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nrb-compose-render-'));
const closureContextFixture = join(temporaryDirectory, 'normalized-closure');
mkdirSync(closureContextFixture);
for (const file of normalizedClosureContextFiles) writeFileSync(join(closureContextFixture, file), `${file}\n`);
const closureCaddyfileFixture = join(temporaryDirectory, 'Caddyfile.per-app-domains');
writeFileSync(
  closureCaddyfileFixture,
  renderClosureCaddyfile({ releaseImages: ['migrator', ...productionApps].sort() }),
);
const closureSingleDomainCaddyfileFixture = join(temporaryDirectory, 'Caddyfile.single-domain');
writeFileSync(
  closureSingleDomainCaddyfileFixture,
  renderClosureSingleDomainCaddyfile({ releaseImages: ['migrator', ...productionApps].sort() }),
);
const mongoUriFile = join(temporaryDirectory, 'mongodb_uri.txt');
const mongoMigrationUriFile = join(temporaryDirectory, 'mongodb_migration_uri.txt');
const mongoBackupRestoreUriFile = join(temporaryDirectory, 'mongodb_backup_restore_uri.txt');
writeFileSync(mongoUriFile, 'mongodb://user:password@mongo/nest_react_boilerplate?replicaSet=rs0&retryWrites=true\n');
writeFileSync(
  mongoMigrationUriFile,
  'mongodb://migration:password@mongo/nest_react_boilerplate?replicaSet=rs0&retryWrites=true\n',
);
writeFileSync(
  mongoBackupRestoreUriFile,
  'mongodb://backup:password@mongo/?authSource=admin&replicaSet=rs0&retryWrites=true\n',
);
process.on('exit', () => rmSync(temporaryDirectory, { force: true, recursive: true }));

const bundledModel = render({
  database: 'bundled-db',
  domains: 'external-proxy',
  profiles: ['telegram', 'discord', 'notification-scheduler', 'notification-consumer'],
  tls: 'external',
});
const externalModel = render({
  database: 'external-db',
  domains: 'external-proxy',
  profiles: ['telegram', 'discord', 'notification-scheduler', 'notification-consumer'],
  tls: 'external',
});
const bundledMongoModel = render({
  database: 'bundled-db',
  domains: 'external-proxy',
  engine: 'mongodb',
  profiles: ['telegram', 'discord', 'notification-scheduler', 'notification-consumer'],
  tls: 'external',
});
const externalMongoModel = render({
  database: 'external-db',
  domains: 'external-proxy',
  engine: 'mongodb',
  profiles: ['telegram', 'discord', 'notification-scheduler', 'notification-consumer'],
  tls: 'external',
});
const singleDomainModel = render({ database: 'bundled-db', domains: 'single-domain', tls: 'automatic' });
const perAppDomainModel = render({ database: 'external-db', domains: 'per-app-domains', tls: 'automatic' });
const providedTlsModel = render({ database: 'bundled-db', domains: 'per-app-domains', tls: 'provided' });
const bundledTelegramModel = render({
  database: 'bundled-db',
  domains: 'per-app-domains',
  profiles: ['telegram'],
  tls: 'automatic',
});
const externalTelegramModel = render({
  database: 'external-db',
  domains: 'per-app-domains',
  profiles: ['telegram'],
  tls: 'automatic',
});
const allOptionalModel = render({
  database: 'bundled-db',
  domains: 'per-app-domains',
  profiles: ['telegram', 'discord', 'notification-consumer', 'notification-scheduler'],
  tls: 'automatic',
});
const productionSourceBuildModel = render({
  database: 'bundled-db',
  domains: 'external-proxy',
  sourceBuild: true,
  tls: 'external',
});
const providerFreeModel = render({
  apps: ['landing-app'],
  database: undefined,
  domains: 'external-proxy',
  engine: null,
  tls: 'external',
});
const backendOnlyEnvironment = {
  AUTH_ALLOWED_RETURN_URLS: 'https://client.example.com',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://client.example.com',
  BETTER_AUTH_URL: 'https://auth.example.com',
  CORS_ORIGINS: 'https://client.example.com',
  EXTERNAL_PROXY_PUBLIC_MODE: '',
};
const selectedPostgresModel = render({
  apps: ['auth-app-api', 'user-app-api'],
  database: 'external-db',
  domains: 'external-proxy',
  engine: 'postgres',
  environment: backendOnlyEnvironment,
  services: ['migrate', 'postgres'],
  tls: 'external',
});
const selectedMongoModel = render({
  apps: ['auth-app-api'],
  database: 'external-db',
  domains: 'external-proxy',
  engine: 'mongodb',
  environment: backendOnlyEnvironment,
  services: ['mongodb', 'mongodb-init', 'mongodb-migrate'],
  tls: 'external',
});
const selectedNotificationModel = render({
  apps: ['notification-consumer'],
  database: 'external-db',
  domains: 'external-proxy',
  engine: 'postgres',
  environment: backendOnlyEnvironment,
  profiles: ['notification-consumer'],
  services: ['migrate', 'notification-consumer', 'postgres'],
  tls: 'external',
});
const customFrontendModel = render({
  apps: ['site-app'],
  database: undefined,
  domains: 'external-proxy',
  engine: null,
  environment: { PRIMARY_APP: 'site-app' },
  tls: 'external',
});

assert.deepEqual(Object.keys(providerFreeModel.services), ['landing-app']);
assert.ok(!providerFreeModel.services.migrate);
assert.ok(!providerFreeModel.services.postgres);
assert.deepEqual(Object.keys(selectedPostgresModel.services).sort(), ['auth-app-api', 'migrate', 'user-app-api']);
assert.ok(!selectedPostgresModel.services['admin-app-api']);
assert.ok(!selectedPostgresModel.secrets.redis_password);
assert.ok(!secretNames(selectedPostgresModel.services['auth-app-api']).includes('redis_password'));
assert.deepEqual(Object.keys(selectedMongoModel.services).sort(), ['auth-app-api', 'migrate']);
assert.ok(!selectedMongoModel.services['user-app-api']);
assert.deepEqual(Object.keys(selectedNotificationModel.services).sort(), ['migrate', 'notification-consumer']);
assert.ok(!selectedNotificationModel.services['notification-consumer'].depends_on?.redis);
assert.deepEqual(Object.keys(customFrontendModel.services), ['site-app']);

const assertResolvedNamedContexts = (model, label) => {
  const builds = Object.entries(model.services).filter(([, service]) => service.build);
  assert.ok(builds.length > 0, `${label} must render Dockerfile builds.`);
  for (const [serviceName, service] of builds) {
    assert.equal(
      service.build.additional_contexts?.['nrb-closure'],
      closureContextFixture,
      `${label} service ${serviceName} omits the resolved nrb-closure context.`,
    );
  }
};
const productionSourceBuildServices = Object.values(productionSourceBuildModel.services);
assert.ok(
  productionSourceBuildServices.length > 0,
  'production source-build Compose must still render product services.',
);
assert.ok(
  productionSourceBuildServices.every((service) => !service.build && service.image),
  'production source-build Compose must use already-baked image refs; Bake compiles, Compose does not.',
);

const renderSelected = (provider, environment = {}) => {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'docker/docker-compose.yml',
      '--profile',
      provider,
      '--profile',
      'user-app-api',
      'config',
      '--format',
      'json',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        AUTH_PERSISTENCE: provider,
        DATABASE_ENGINE: provider,
        ...environment,
        NRB_CLOSURE_CONTEXT: closureContextFixture,
      },
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? result.stdout ?? 'Selected Docker Compose render failed.\n');
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
};
const selectedPostgresCompose = renderSelected('postgres');
const selectedMongoCompose = renderSelected('mongodb', { MONGODB_PORT: '37117' });
assertResolvedNamedContexts(selectedPostgresCompose, 'selected PostgreSQL Compose');
assertResolvedNamedContexts(selectedMongoCompose, 'selected MongoDB Compose');
assert.deepEqual(
  selectedMongoCompose.services.mongodb.ports.map(({ published, target }) => ({ published, target })),
  [{ published: '37117', target: 37117 }],
  'A non-default MongoDB port must be identical on the host and in the container.',
);
assert.deepEqual(selectedMongoCompose.services.mongodb.command.slice(-2), ['--port', '37117']);
assert.equal(selectedMongoCompose.services['mongodb-init'].environment.MONGODB_PORT, '37117');
assert.equal(
  selectedMongoCompose.services['mongodb-init'].environment.MONGODB_ADVERTISED_HOST,
  'mongodb.localhost:37117',
);
assert.equal(selectedMongoCompose.services['mongodb-init'].environment.MONGODB_INIT_TIMEOUT_SECONDS, '120');
assert.deepEqual(selectedMongoCompose.services['mongodb-init'].entrypoint, [
  'bash',
  '/opt/mongodb/prepare-replica-set.sh',
]);

for (const model of [bundledTelegramModel, externalTelegramModel]) {
  const auth = model.services['auth-app-api'];
  assert.equal(auth.environment.AUTH_TELEGRAM_ENABLED, 'true');
  assert.equal(auth.environment.TELEGRAM_OIDC_ENABLED, 'true');
  assert.equal(auth.environment.TELEGRAM_OIDC_CLIENT_ID, '123456789');
  assert.ok(secretNames(auth).includes('better_auth_secret'));
  assert.ok(secretNames(auth).includes('telegram_bot_token'));
  assert.ok(secretNames(auth).includes('telegram_oidc_client_secret'));
  assert.equal(model.services.edge.environment.EDGE_OPTIONAL_ROUTES, 'telegram');
}
assert.ok(secretNames(bundledTelegramModel.services['auth-app-api']).includes('postgres_password'));
assert.ok(bundledTelegramModel.services['auth-app-api'].depends_on?.postgres);
assert.ok(secretNames(externalTelegramModel.services['auth-app-api']).includes('database_url'));
assert.ok(!externalTelegramModel.services['auth-app-api'].depends_on?.postgres);

assert.ok(bundledModel.services.postgres, 'Bundled-db render must include PostgreSQL.');
assert.ok(!externalModel.services.postgres, 'External-db render must exclude PostgreSQL.');
assert.ok(bundledMongoModel.services.mongodb, 'Bundled MongoDB render must include MongoDB.');
assert.ok(bundledMongoModel.services['mongodb-init'], 'Bundled MongoDB render must include preparation.');
assert.ok(!externalMongoModel.services.mongodb, 'External MongoDB render must exclude MongoDB.');
assert.ok(bundledModel.secrets.session_secret, 'Production render must include the generated session secret.');
assert.ok(
  bundledModel.secrets.auth_provider_token_encryption_key,
  'Production render must include provider encryption.',
);
assert.ok(bundledModel.secrets.redis_password, 'Production render must include Redis authentication.');
assert.ok(secretNames(bundledModel.services.redis).includes('redis_password'));
assert.match(bundledModel.services.redis.command.join('\n'), /requirepass/u);
for (const service of ['admin-app-api', 'user-app-api', 'auth-app-api', 'discord-app-api', 'telegram-bot-api']) {
  assert.ok(
    secretNames(bundledModel.services[service]).includes('redis_password'),
    `${service} must mount redis_password.`,
  );
}
assert.ok(secretNames(bundledModel.services['auth-app-api']).includes('auth_provider_token_encryption_key'));
assert.ok(bundledModel.volumes['postgres-data'], 'Bundled-db render must include the PostgreSQL volume.');
assert.ok(!externalModel.volumes['postgres-data'], 'External-db render must exclude the PostgreSQL volume.');
assert.ok(bundledModel.secrets.postgres_password, 'Bundled-db render must include postgres_password.');
assert.ok(!bundledModel.secrets.database_url, 'Bundled-db render must not include database_url.');
assert.ok(externalModel.secrets.database_url, 'External-db render must include database_url.');
assert.ok(!externalModel.secrets.postgres_password, 'External-db render must not include postgres_password.');
assert.ok(bundledMongoModel.secrets.mongodb_password, 'Bundled MongoDB render must include its application password.');
assert.ok(bundledMongoModel.secrets.mongodb_migration_password, 'Bundled MongoDB must include a migration password.');
assert.ok(
  bundledMongoModel.secrets.mongodb_backup_restore_password,
  'Bundled MongoDB must include a backup/restore password.',
);
assert.ok(bundledMongoModel.secrets.mongodb_root_password, 'Bundled MongoDB render must include its root password.');
assert.ok(bundledMongoModel.secrets.mongodb_keyfile, 'Bundled MongoDB render must include its keyfile.');
assert.ok(!bundledMongoModel.secrets.database_url, 'Bundled MongoDB render must exclude PostgreSQL URL secrets.');
assert.ok(externalMongoModel.secrets.mongodb_uri, 'External MongoDB render must include its URI secret.');
assert.ok(externalMongoModel.secrets.mongodb_migration_uri, 'External MongoDB must include its migration URI secret.');
assert.ok(!externalMongoModel.secrets.postgres_password, 'External MongoDB render must exclude PostgreSQL secrets.');
assert.ok(!bundledModel.services.edge, 'External-proxy mode must not start a Compose-owned edge.');
assert.ok(!externalModel.services.edge, 'External-proxy mode must not start a Compose-owned edge.');

for (const service of [
  'migrate',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'notification-scheduler',
  'notification-consumer',
]) {
  assert.equal(
    allOptionalModel.services[service].user,
    '0:0',
    `${service} must elevate only the secret-loading entrypoint before it drops privileges.`,
  );
}

for (const service of ['admin-app-api', 'user-app-api', 'auth-app-api', 'discord-app-api', 'telegram-bot-api']) {
  assert.match(
    allOptionalModel.services[service].healthcheck.test.join(' '),
    /su-exec 1000:1000 node/u,
    `${service} healthcheck must run Node as numeric UID/GID 1000.`,
  );
}

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

for (const service of databaseConsumers) {
  const bundledService = bundledMongoModel.services[service];
  const externalService = externalMongoModel.services[service];
  assert.equal(bundledService.environment.DATABASE_ENGINE, 'mongodb');
  assert.equal(externalService.environment.DATABASE_ENGINE, 'mongodb');
  assert.ok(
    secretNames(bundledService).includes(service === 'migrate' ? 'mongodb_migration_password' : 'mongodb_password'),
  );
  assert.ok(!secretNames(bundledService).includes('postgres_password'));
  assert.ok(bundledService.depends_on?.['mongodb-init']);
  assert.ok(secretNames(externalService).includes(service === 'migrate' ? 'mongodb_migration_uri' : 'mongodb_uri'));
  assert.ok(!secretNames(externalService).includes('database_url'));
  assert.ok(!externalService.depends_on?.mongodb);
}
for (const model of [bundledModel, externalModel]) {
  assert.ok(!model.services.mongodb);
  assert.ok(!model.services['mongodb-init']);
  assert.ok(!model.secrets.mongodb_uri);
  assert.ok(!model.secrets.mongodb_password);
}

assert.ok(
  networkNames(externalModel.services.migrate).includes('app'),
  'External-db migration service needs an egress-capable network.',
);

const singleEdge = singleDomainModel.services.edge;
assert.equal(singleEdge.image, 'caddy:2.11.4-alpine');
assert.equal(singleEdge.command[3], '/nrb/Caddyfile.selected');
assert.equal(singleEdge.environment.PUBLIC_DOMAIN, 'example.com');
assert.equal(singleEdge.environment.PRIMARY_APP_UPSTREAM, 'landing-app:8080');
assert.equal(singleDomainModel.services['auth-app-api'].environment.CORS_ORIGINS, 'https://example.com');
assert.equal(singleDomainModel.services['auth-app-api'].environment.AUTH_ALLOWED_RETURN_URLS, 'https://example.com');
assert.equal(singleDomainModel.services['landing-app'].environment.LANDING_USER_APP_URL, '/app');
assert.equal(singleDomainModel.services['landing-app'].environment.LANDING_ADMIN_APP_URL, '/admin');
assert.deepEqual(
  singleEdge.ports.map(({ host_ip: hostIp, protocol, published, target }) => ({ hostIp, protocol, published, target })),
  [
    { hostIp: '0.0.0.0', protocol: 'tcp', published: '80', target: 80 },
    { hostIp: '0.0.0.0', protocol: 'tcp', published: '443', target: 443 },
    { hostIp: '0.0.0.0', protocol: 'udp', published: '443', target: 443 },
  ],
);

const perAppEdge = perAppDomainModel.services.edge;
assert.equal(perAppEdge.command[3], '/nrb/Caddyfile.selected');
assert.equal(perAppEdge.environment.LANDING_APP_DOMAIN, 'example.com');
assert.equal(perAppEdge.environment.AUTH_APP_API_DOMAIN, 'auth-app-api.example.com');
assert.equal(
  perAppDomainModel.services['landing-app'].environment.LANDING_USER_APP_URL,
  'https://user-app.example.com',
);
assert.equal(
  perAppDomainModel.services['landing-app'].environment.LANDING_ADMIN_APP_URL,
  'https://admin-app.example.com',
);
assert.equal(
  Object.hasOwn(perAppDomainModel.services['user-app'].environment, 'LANDING_USER_APP_URL'),
  false,
  'landing application destinations must not be injected into unrelated frontends',
);
assert.equal(perAppEdge.read_only, true);
assert.ok(networkNames(perAppEdge).includes('app'));
assert.ok(perAppDomainModel.volumes['caddy-data']);
assert.ok(perAppDomainModel.volumes['caddy-config']);

const providedEdge = providedTlsModel.services.edge;
assert.equal(providedEdge.environment.EDGE_TLS_MODE, 'provided');
assert.ok(volumeTargets(providedEdge).includes('/certs/tls.crt'));
assert.ok(volumeTargets(providedEdge).includes('/certs/tls.key'));

assert.ok(allOptionalModel.services['discord-app-api']);
assert.ok(allOptionalModel.services['telegram-bot-api']);
assert.equal(allOptionalModel.services.edge.environment.EDGE_OPTIONAL_ROUTES, 'discord-telegram');
assert.equal(allOptionalModel.services['auth-app-api'].environment.DISCORD_AUTH_ENABLED, 'true');
assert.ok(secretNames(allOptionalModel.services['auth-app-api']).includes('discord_client_secret'));

const caddyEnvironment = {
  ADMIN_APP_API_DOMAIN: 'admin-app-api.example.com',
  ADMIN_APP_DOMAIN: 'admin-app.example.com',
  AUTH_APP_API_DOMAIN: 'auth-app-api.example.com',
  DISCORD_APP_API_DOMAIN: 'discord-app-api.example.com',
  EDGE_TLS_MODE: 'automatic',
  LANDING_APP_DOMAIN: 'example.com',
  MOBILE_APP_DOMAIN: 'mobile-app.example.com',
  PRIMARY_APP_UPSTREAM: 'landing-app:8080',
  PUBLIC_DOMAIN: 'example.com',
  SITE_APP_DOMAIN: 'site-app.example.com',
  TELEGRAM_BOT_API_DOMAIN: 'telegram-bot-api.example.com',
  USER_APP_API_DOMAIN: 'user-app-api.example.com',
  USER_APP_DOMAIN: 'user-app.example.com',
};

const validateCaddy = (config, optionalRoutes, generatedConfig) => {
  const environmentArguments = Object.entries({ ...caddyEnvironment, EDGE_OPTIONAL_ROUTES: optionalRoutes }).flatMap(
    ([key, value]) => ['-e', `${key}=${value}`],
  );
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${join(rootDir, 'docker/caddy')}:/etc/caddy:ro`,
      ...(generatedConfig ? ['-v', `${generatedConfig}:/nrb/Caddyfile.selected:ro`] : []),
      ...environmentArguments,
      'caddy:2.11.4-alpine',
      'caddy',
      'validate',
      '--config',
      generatedConfig ? config : `/etc/caddy/${config}`,
      '--adapter',
      'caddyfile',
    ],
    { cwd: rootDir, encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? result.stdout ?? 'Caddy validation failed.\n');
    process.exit(result.status ?? 1);
  }
};

validateCaddy('Caddyfile.single-domain', 'default');
validateCaddy('/nrb/Caddyfile.selected', 'default', closureSingleDomainCaddyfileFixture);
for (const optionalRoutes of ['default', 'discord', 'telegram', 'discord-telegram']) {
  validateCaddy('Caddyfile.per-app-domains', optionalRoutes);
  validateCaddy('/nrb/Caddyfile.selected', optionalRoutes, closureCaddyfileFixture);
}

console.log(
  JSON.stringify({
    status: 'ok',
    modes: {
      database: ['bundled-db', 'external-db'],
      databaseEngine: ['postgres', 'mongodb'],
      domains: ['external-proxy', 'single-domain', 'per-app-domains'],
      profiles: ['discord', 'notification-consumer', 'notification-scheduler', 'telegram'],
      tls: ['external', 'automatic', 'provided'],
    },
  }),
);
