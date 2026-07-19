#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildComposeInvocation } from './compose-production.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(rootDir, path), 'utf8');
const base = read('docker/docker-compose.prod.yml');
const bundled = read('docker/docker-compose.prod.bundled-db.yml');
const external = read('docker/docker-compose.prod.external-db.yml');
const telegram = read('docker/docker-compose.prod.telegram.yml');
const discord = read('docker/docker-compose.prod.discord.yml');
const edge = read('docker/docker-compose.prod.edge.yml');
const providedTls = read('docker/docker-compose.prod.edge-provided-tls.yml');
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
for (const [variable, path] of [
  ['SESSION_SECRET', 'session_secret'],
  ['AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY', 'auth_provider_token_encryption_key'],
  ['REDIS_PASSWORD', 'redis_password'],
]) {
  assert.ok(
    secretEntrypoint.includes(`load_secret ${variable} /run/secrets/${path}`),
    `The production entrypoint must load ${variable}.`,
  );
}
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
assert.ok(
  secretEntrypoint.includes('load_secret BETTER_AUTH_SECRET /run/secrets/better_auth_secret'),
  'The production entrypoint must load the Better Auth secret.',
);
assert.ok(
  secretEntrypoint.includes('load_secret TELEGRAM_OIDC_CLIENT_SECRET /run/secrets/telegram_oidc_client_secret'),
  'The production entrypoint must load the Telegram OIDC client secret.',
);
assert.ok(
  secretEntrypoint.includes('load_secret DISCORD_CLIENT_SECRET /run/secrets/discord_client_secret'),
  'The production entrypoint must load the Discord OAuth client secret.',
);
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

const render = ({ database, domains, profiles = [], tls }) => {
  const arguments_ = [
    'config',
    '--env-file=.env.production.example',
    `--database=${database}`,
    `--domains=${domains}`,
    `--tls=${tls}`,
    ...profiles.map((profile) => `--profile=${profile}`),
    '--format',
    'json',
  ];
  const invocation = buildComposeInvocation(arguments_, {
    ...process.env,
    IMAGE_TAG: 'sha-0123456789abcdef0123456789abcdef01234567',
    TELEGRAM_OIDC_CLIENT_ID: '123456789',
  });
  const result = spawnSync('docker', invocation.args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: invocation.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? result.stdout ?? 'Docker Compose render failed.\n');
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
};

const secretNames = (service) => (service.secrets ?? []).map((secret) => secret.source ?? secret);
const networkNames = (service) =>
  Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? {});
const volumeTargets = (service) => (service.volumes ?? []).map((volume) => volume.target ?? volume);

const bundledModel = render({
  database: 'bundled-db',
  domains: 'external-proxy',
  profiles: ['telegram', 'discord'],
  tls: 'external',
});
const externalModel = render({
  database: 'external-db',
  domains: 'external-proxy',
  profiles: ['telegram', 'discord'],
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
  profiles: ['telegram', 'discord'],
  tls: 'automatic',
});

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
assert.ok(!bundledModel.services.edge, 'External-proxy mode must not start a Compose-owned edge.');
assert.ok(!externalModel.services.edge, 'External-proxy mode must not start a Compose-owned edge.');

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

const singleEdge = singleDomainModel.services.edge;
assert.equal(singleEdge.image, 'caddy:2.11.4-alpine');
assert.equal(singleEdge.command[3], '/etc/caddy/Caddyfile.single-domain');
assert.equal(singleEdge.environment.PUBLIC_DOMAIN, 'example.com');
assert.equal(singleEdge.environment.PRIMARY_APP_UPSTREAM, 'landing-app:8080');
assert.equal(singleDomainModel.services['auth-app-api'].environment.CORS_ORIGINS, 'https://example.com');
assert.equal(singleDomainModel.services['auth-app-api'].environment.AUTH_ALLOWED_RETURN_URLS, 'https://example.com');
assert.deepEqual(
  singleEdge.ports.map(({ host_ip: hostIp, protocol, published, target }) => ({ hostIp, protocol, published, target })),
  [
    { hostIp: '0.0.0.0', protocol: 'tcp', published: '80', target: 80 },
    { hostIp: '0.0.0.0', protocol: 'tcp', published: '443', target: 443 },
    { hostIp: '0.0.0.0', protocol: 'udp', published: '443', target: 443 },
  ],
);

const perAppEdge = perAppDomainModel.services.edge;
assert.equal(perAppEdge.command[3], '/etc/caddy/Caddyfile.per-app-domains');
assert.equal(perAppEdge.environment.LANDING_APP_DOMAIN, 'example.com');
assert.equal(perAppEdge.environment.AUTH_APP_API_DOMAIN, 'auth-app-api.example.com');
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

const validateCaddy = (config, optionalRoutes) => {
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
      ...environmentArguments,
      'caddy:2.11.4-alpine',
      'caddy',
      'validate',
      '--config',
      `/etc/caddy/${config}`,
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
for (const optionalRoutes of ['default', 'discord', 'telegram', 'discord-telegram']) {
  validateCaddy('Caddyfile.per-app-domains', optionalRoutes);
}

console.log(
  JSON.stringify({
    status: 'ok',
    modes: {
      database: ['bundled-db', 'external-db'],
      domains: ['external-proxy', 'single-domain', 'per-app-domains'],
      profiles: ['discord', 'telegram'],
      tls: ['external', 'automatic', 'provided'],
    },
  }),
);
