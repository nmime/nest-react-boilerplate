// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildComposeInvocation as buildComposeInvocationBase,
  derivePublicDomains,
  parseEnvFile,
  validateBaseDomain,
  validateExternalMongoUri,
} from './compose-production.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dockerAvailable = spawnSync('docker', ['info'], { cwd: root, stdio: 'ignore' }).status === 0;

const allApps = [
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
const coreApps = allApps.filter(
  (app) => !['discord-app-api', 'notification-consumer', 'notification-scheduler', 'telegram-bot-api'].includes(app),
);
const closure = (provider = 'postgres', apps = coreApps, services = ['migrate', 'postgres', 'redis']) => ({
  provider,
  releaseImages: [...(provider ? ['migrator'] : []), ...apps].sort(),
  roots: [...apps].sort(),
  selectedApps: [...apps].sort(),
  services: [...services].sort(),
});
const buildComposeInvocation = (argv, environment = {}, dependencies = {}) =>
  buildComposeInvocationBase(argv, environment, {
    readProductionClosure: () => closure(),
    ...dependencies,
  });
const mongoClosureDependencies = {
  readProductionClosure: () => closure('mongodb', allApps, ['mongodb', 'mongodb-init', 'mongodb-migrate', 'redis']),
};

test('frontend runtime config emits only same-origin or HTTPS landing destinations', (context) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nrb-frontend-runtime-config-'));
  context.after(() => rmSync(temporaryDirectory, { force: true, recursive: true }));
  const target = join(temporaryDirectory, 'runtime-config.js');
  const script = resolve(root, 'docker/frontend-runtime-config.sh');
  const render = (environment) => {
    writeFileSync(target, '');
    const result = spawnSync('sh', [script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        FRONTEND_RUNTIME_CONFIG_PATH: target,
        ...environment,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(target, 'utf8');
  };

  const valid = render({
    LANDING_ADMIN_APP_URL: 'https://admin.product.example',
    LANDING_USER_APP_URL: '/app',
  });
  assert.match(valid, /"userAppUrl": "\/app"/u);
  assert.match(valid, /"adminAppUrl": "https:\/\/admin\.product\.example"/u);

  const invalid = render({
    LANDING_ADMIN_APP_URL: 'https://user@admin.product.example',
    LANDING_USER_APP_URL: 'http://user.product.example',
  });
  assert.doesNotMatch(invalid, /userAppUrl|adminAppUrl/u);
});

test(
  'secret entrypoint ignores Kubernetes service-account mounts but rejects declared Docker secrets',
  { skip: !dockerAvailable },
  (context) => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nrb-secret-entrypoint-'));
    context.after(() => rmSync(temporaryDirectory, { force: true, recursive: true }));
    const mountedFile = join(temporaryDirectory, 'mounted-secret');
    writeFileSync(mountedFile, 'not-a-real-secret', { mode: 0o600 });
    const entrypoint = resolve(root, 'docker/secret-entrypoint.sh');
    const run = (target) =>
      spawnSync(
        'docker',
        [
          'run',
          '--rm',
          '--user',
          '1000:1000',
          '--volume',
          `${entrypoint}:/entrypoint:ro`,
          '--volume',
          `${mountedFile}:${target}:ro`,
          '--entrypoint',
          '/bin/sh',
          'node:24.18.0-alpine',
          '/entrypoint',
          'sh',
          '-ec',
          'test "$(id -u):$(id -g)" = "1000:1000"',
        ],
        { cwd: root, encoding: 'utf8', timeout: 120_000 },
      );

    const kubernetesMount = run('/var/run/secrets/kubernetes.io/serviceaccount/token');
    assert.equal(kubernetesMount.status, 0, kubernetesMount.stderr);

    const dockerSecretMount = run('/run/secrets/session_secret');
    assert.notEqual(dockerSecretMount.status, 0);
    assert.match(dockerSecretMount.stderr, /must start as root/u);
  },
);

test('parses ordinary and quoted environment values without exposing comments', () => {
  assert.deepEqual(parseEnvFile('A=one\nB="two words"\n# SECRET=no\nC=\'three\'\n'), {
    A: 'one',
    B: 'two words',
    C: 'three',
  });
});

test('derives exact app-id hostnames and keeps landing on the apex by default', () => {
  assert.deepEqual(derivePublicDomains('example.com', 'landing-app'), {
    LANDING_APP_DOMAIN: 'example.com',
    SITE_APP_DOMAIN: 'site-app.example.com',
    USER_APP_DOMAIN: 'user-app.example.com',
    ADMIN_APP_DOMAIN: 'admin-app.example.com',
    MOBILE_APP_DOMAIN: 'mobile-app.example.com',
    AUTH_APP_API_DOMAIN: 'auth-app-api.example.com',
    USER_APP_API_DOMAIN: 'user-app-api.example.com',
    ADMIN_APP_API_DOMAIN: 'admin-app-api.example.com',
    DISCORD_APP_API_DOMAIN: 'discord-app-api.example.com',
    TELEGRAM_BOT_API_DOMAIN: 'telegram-bot-api.example.com',
  });
});

test('can assign the apex to site without changing any API hostname', () => {
  const domains = derivePublicDomains('product.example', 'site-app');
  assert.equal(domains.LANDING_APP_DOMAIN, 'landing-app.product.example');
  assert.equal(domains.SITE_APP_DOMAIN, 'product.example');
  assert.equal(domains.AUTH_APP_API_DOMAIN, 'auth-app-api.product.example');
});

test('rejects schemes, ports, paths, wildcards, and invalid apex owners', () => {
  for (const invalid of ['https://example.com', 'example.com:443', 'example.com/path', '*.example.com', 'localhost']) {
    assert.throws(() => validateBaseDomain(invalid), /PUBLIC_DOMAIN/u);
  }
  assert.throws(() => derivePublicDomains('example.com', 'user-app'), /PRIMARY_APP/u);
});

test('builds the per-app automatic HTTPS topology from the production example', () => {
  const invocation = buildComposeInvocation(['config', '--env-file=.env.production.example'], {});
  assert.equal(invocation.databaseMode, 'bundled-db');
  assert.equal(invocation.databaseEngine, 'postgres');
  assert.equal(invocation.domainMode, 'per-app-domains');
  assert.equal(invocation.tlsMode, 'automatic');
  assert.deepEqual(invocation.profiles, []);
  assert.ok(invocation.files.includes('docker/docker-compose.prod.edge.yml'));
  assert.ok(!invocation.files.includes('docker/docker-compose.prod.edge-provided-tls.yml'));
  assert.equal(invocation.env.AUTH_APP_API_DOMAIN, 'auth-app-api.example.com');
  assert.equal(invocation.env.PRIMARY_APP_UPSTREAM, 'landing-app:8080');
  assert.equal(invocation.env.EDGE_CADDYFILE, '/nrb/Caddyfile.selected');
  assert.equal(invocation.env.BETTER_AUTH_URL, 'https://user-app.example.com');
  assert.equal(invocation.env.LANDING_USER_APP_URL, 'https://user-app.example.com');
  assert.equal(invocation.env.LANDING_ADMIN_APP_URL, 'https://admin-app.example.com');
  assert.equal(
    invocation.env.AUTH_ALLOWED_RETURN_URLS,
    'https://example.com,https://site-app.example.com,https://user-app.example.com,https://admin-app.example.com,https://mobile-app.example.com',
  );
  assert.match(invocation.env.CORS_ORIGINS, /https:\/\/admin-app\.example\.com/u);
});

test('models database engine independently from bundled or external ownership', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-compose-mongodb-'));
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const uriFile = join(directory, 'mongodb_uri.txt');
  const migrationUriFile = join(directory, 'mongodb_migration_uri.txt');
  const backupRestoreUriFile = join(directory, 'mongodb_backup_restore_uri.txt');
  writeFileSync(uriFile, 'mongodb://user:password@mongo-a,mongo-b/app?replicaSet=prod-rs&retryWrites=true\n');
  writeFileSync(
    migrationUriFile,
    'mongodb://migration:password@mongo-a,mongo-b/app?replicaSet=prod-rs&retryWrites=true\n',
  );
  writeFileSync(
    backupRestoreUriFile,
    'mongodb://backup:password@mongo-a,mongo-b/?authSource=admin&replicaSet=prod-rs&retryWrites=true\n',
  );

  const combinations = [
    ['postgres', 'bundled-db', 'docker/docker-compose.prod.bundled-db.yml'],
    ['postgres', 'external-db', 'docker/docker-compose.prod.external-db.yml'],
    ['mongodb', 'bundled-db', 'docker/docker-compose.prod.mongodb-bundled-db.yml'],
    ['mongodb', 'external-db', 'docker/docker-compose.prod.mongodb-external-db.yml'],
  ];
  for (const [engine, ownership, overlay] of combinations) {
    const invocation = buildComposeInvocation(
      ['config', '--env-file=.env.production.example', `--engine=${engine}`, `--database=${ownership}`],
      {
        MONGODB_BACKUP_RESTORE_URI_FILE: backupRestoreUriFile,
        MONGODB_MIGRATION_URI_FILE: migrationUriFile,
        MONGODB_REPLICA_SET: 'prod-rs',
        MONGODB_URI_FILE: uriFile,
      },
      {
        readProductionClosure: () =>
          closure(
            engine,
            allApps,
            engine === 'postgres'
              ? ['migrate', 'postgres', 'redis']
              : ['mongodb', 'mongodb-init', 'mongodb-migrate', 'redis'],
          ),
      },
    );
    assert.equal(invocation.databaseEngine, engine);
    assert.equal(invocation.databaseMode, ownership);
    assert.deepEqual(invocation.files.slice(0, 2), ['docker/docker-compose.prod.yml', overlay]);
    if (engine === 'mongodb' && ownership === 'external-db') {
      assert.equal(invocation.env.MONGODB_REPLICA_SET, 'prod-rs');
    }
  }
});

test('requires an explicit replica set in an external MongoDB secret URI', (context) => {
  assert.equal(
    validateExternalMongoUri('mongodb+srv://cluster.example/app?replicaSet=atlas-rs').protocol,
    'mongodb+srv:',
  );
  assert.deepEqual(
    validateExternalMongoUri('mongodb://user:password@mongo-a.example:27017,mongo-b.example:27018/app?replicaSet=rs0')
      .hosts,
    ['mongo-a.example:27017', 'mongo-b.example:27018'],
  );
  assert.equal(
    validateExternalMongoUri('mongodb://backup@cluster.example/?authSource=admin&replicaSet=atlas-rs', {
      deploymentWide: true,
      label: 'MONGODB_BACKUP_RESTORE_URI_FILE',
    }).pathname,
    '/',
  );
  assert.throws(
    () =>
      validateExternalMongoUri('mongodb://backup@cluster.example/app?authSource=admin&replicaSet=atlas-rs', {
        deploymentWide: true,
        label: 'MONGODB_BACKUP_RESTORE_URI_FILE',
      }),
    /deployment-wide/u,
  );
  for (const invalid of [
    'https://cluster.example/app?replicaSet=rs0',
    'mongodb://cluster.example/app',
    'mongodb://cluster.example/app?replicaSet=',
  ]) {
    assert.throws(() => validateExternalMongoUri(invalid), /mongodb|replicaSet/iu);
  }

  const directory = mkdtempSync(join(tmpdir(), 'nrb-compose-mongodb-invalid-'));
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const uriFile = join(directory, 'mongodb_uri.txt');
  const migrationUriFile = join(directory, 'mongodb_migration_uri.txt');
  const backupRestoreUriFile = join(directory, 'mongodb_backup_restore_uri.txt');
  writeFileSync(migrationUriFile, 'mongodb://migration@cluster.example/app?replicaSet=uri-rs\n');
  writeFileSync(backupRestoreUriFile, 'mongodb://backup@cluster.example/?authSource=admin&replicaSet=uri-rs\n');
  writeFileSync(uriFile, 'mongodb://cluster.example/app\n');
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--engine=mongodb', '--database=external-db'],
        {
          MONGODB_BACKUP_RESTORE_URI_FILE: backupRestoreUriFile,
          MONGODB_MIGRATION_URI_FILE: migrationUriFile,
          MONGODB_URI_FILE: uriFile,
        },
        mongoClosureDependencies,
      ),
    /replicaSet/u,
  );

  writeFileSync(uriFile, 'mongodb://runtime@cluster.example/app?replicaSet=uri-rs\n');
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--engine=mongodb', '--database=external-db'],
        {
          MONGODB_BACKUP_RESTORE_URI_FILE: backupRestoreUriFile,
          MONGODB_MIGRATION_URI_FILE: migrationUriFile,
          MONGODB_REPLICA_SET: 'different-rs',
          MONGODB_URI_FILE: uriFile,
        },
        mongoClosureDependencies,
      ),
    /must match/u,
  );
});

test('rejects reused MongoDB production principal identities', (context) => {
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--engine=mongodb', '--database=bundled-db'],
        { MONGODB_MIGRATION_USER: 'same-user', MONGODB_USER: 'same-user' },
        mongoClosureDependencies,
      ),
    /must be distinct/u,
  );

  const directory = mkdtempSync(join(tmpdir(), 'nrb-compose-mongodb-principals-'));
  context.after(() => rmSync(directory, { force: true, recursive: true }));
  const uriFile = join(directory, 'mongodb_uri.txt');
  const migrationUriFile = join(directory, 'mongodb_migration_uri.txt');
  const backupRestoreUriFile = join(directory, 'mongodb_backup_restore_uri.txt');
  writeFileSync(uriFile, 'mongodb://same@mongo/app?replicaSet=rs0\n');
  writeFileSync(migrationUriFile, 'mongodb://same@mongo/app?replicaSet=rs0\n');
  writeFileSync(backupRestoreUriFile, 'mongodb://backup@mongo/?authSource=admin&replicaSet=rs0\n');
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--engine=mongodb', '--database=external-db'],
        {
          MONGODB_BACKUP_RESTORE_URI_FILE: backupRestoreUriFile,
          MONGODB_MIGRATION_URI_FILE: migrationUriFile,
          MONGODB_URI_FILE: uriFile,
        },
        mongoClosureDependencies,
      ),
    /usernames must be non-empty and distinct/u,
  );
});

test('builds one-host and external-proxy variants without incompatible overlays', () => {
  const single = buildComposeInvocation(
    [
      'up',
      '--env-file=.env.production.example',
      '--database=external-db',
      '--domains=single-domain',
      '--tls=provided',
      '-d',
    ],
    {},
  );
  assert.ok(single.files.includes('docker/docker-compose.prod.external-db.yml'));
  assert.ok(single.files.includes('docker/docker-compose.prod.edge-provided-tls.yml'));
  assert.equal(single.env.CORS_ORIGINS, 'https://example.com');
  assert.equal(single.env.BETTER_AUTH_URL, 'https://example.com');
  assert.equal(single.env.AUTH_ALLOWED_RETURN_URLS, 'https://example.com');
  assert.equal(single.env.LANDING_USER_APP_URL, '/app');
  assert.equal(single.env.LANDING_ADMIN_APP_URL, '/admin');

  const siteApex = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=single-domain', '--tls=automatic'],
    { PRIMARY_APP: 'site-app', PUBLIC_DOMAIN: 'product.example' },
  );
  assert.equal(siteApex.env.PRIMARY_APP_UPSTREAM, 'site-app:80');
  assert.equal(siteApex.env.SITE_APP_DOMAIN, 'product.example');
  assert.equal(siteApex.env.LANDING_APP_DOMAIN, 'landing-app.product.example');

  const external = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { EXTERNAL_PROXY_PUBLIC_MODE: '' },
  );
  assert.ok(!external.files.includes('docker/docker-compose.prod.edge.yml'));
  assert.equal(
    external.env.CORS_ORIGINS,
    'https://admin-app.example.com,https://user-app.example.com,https://example.com,https://site-app.example.com,https://mobile-app.example.com',
  );
});

test('keeps same-origin builds free of stale API domains and validates explicit split-origin builds', () => {
  const sameOrigin = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=single-domain', '--tls=automatic'],
    {
      VITE_ADMIN_API_BASE_URL: 'https://legacy-admin.example.test',
      VITE_AUTH_API_BASE_URL: 'https://legacy-auth.example.test',
      VITE_USER_API_BASE_URL: 'https://legacy-user.example.test',
    },
  );
  assert.equal(sameOrigin.env.VITE_API_BASE_URL_MODE, 'same-origin');
  assert.equal(sameOrigin.env.VITE_AUTH_API_BASE_URL, '');
  assert.equal(sameOrigin.env.VITE_USER_API_BASE_URL, '');
  assert.equal(sameOrigin.env.VITE_ADMIN_API_BASE_URL, '');

  const splitOrigin = buildComposeInvocation(['config', '--env-file=.env.production.example'], {
    FRONTEND_NGINX_CONFIG: 'docker/nginx-spa.conf',
    VITE_ADMIN_API_BASE_URL: 'https://admin-api.product.example/',
    VITE_API_BASE_URL_MODE: 'split-origin',
    VITE_AUTH_API_BASE_URL: 'https://auth-api.product.example/',
    VITE_USER_API_BASE_URL: 'https://user-api.product.example/',
  });
  assert.equal(splitOrigin.env.FRONTEND_NGINX_CONFIG, 'docker/nginx-spa.conf');
  assert.equal(splitOrigin.env.VITE_AUTH_API_BASE_URL, 'https://auth-api.product.example');

  assert.throws(
    () =>
      buildComposeInvocation(['config', '--env-file=.env.production.example'], {
        FRONTEND_NGINX_CONFIG: 'docker/nginx-spa.conf',
        VITE_API_BASE_URL_MODE: 'split-origin',
        VITE_AUTH_API_BASE_URL: 'https://auth-api.product.example/path',
      }),
    /VITE_AUTH_API_BASE_URL|VITE_USER_API_BASE_URL/u,
  );
});

test('derives external host-proxy runtime URLs from its declared public topology', () => {
  const single = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { EXTERNAL_PROXY_PUBLIC_MODE: 'single-domain' },
  );
  assert.equal(single.publicDomainMode, 'single-domain');
  assert.equal(single.env.BETTER_AUTH_URL, 'https://example.com');
  assert.equal(single.env.CORS_ORIGINS, 'https://example.com');
  assert.equal(single.env.TELEGRAM_MINI_APP_URL, 'https://example.com/telegram-mini-app');

  const perApp = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { EXTERNAL_PROXY_PUBLIC_MODE: 'per-app-domains' },
  );
  assert.equal(perApp.publicDomainMode, 'per-app-domains');
  assert.equal(perApp.env.BETTER_AUTH_URL, 'https://user-app.example.com');
  assert.equal(perApp.env.LANDING_USER_APP_URL, 'https://user-app.example.com');
  assert.equal(perApp.env.LANDING_ADMIN_APP_URL, 'https://admin-app.example.com');
  assert.match(perApp.env.CORS_ORIGINS, /https:\/\/admin-app\.example\.com/u);

  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
        { EXTERNAL_PROXY_PUBLIC_MODE: 'wildcard' },
      ),
    /EXTERNAL_PROXY_PUBLIC_MODE/u,
  );
});

test('wires optional profiles into both services and edge routes', () => {
  const invocation = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--profile=telegram,discord'],
    {},
    { readProductionClosure: () => closure('postgres', [...coreApps, 'discord-app-api', 'telegram-bot-api']) },
  );
  assert.deepEqual(invocation.profiles, ['discord', 'telegram']);
  assert.equal(invocation.env.EDGE_OPTIONAL_ROUTES, 'discord-telegram');
  assert.equal(invocation.env.AUTH_TELEGRAM_ENABLED, 'true');
  assert.equal(invocation.env.TELEGRAM_OIDC_ENABLED, 'true');
  assert.equal(invocation.env.VITE_TELEGRAM_AUTH_ENABLED, 'true');
  assert.equal(invocation.env.DISCORD_AUTH_ENABLED, 'true');
  assert.ok(invocation.files.includes('docker/docker-compose.prod.telegram.yml'));
  assert.ok(invocation.files.includes('docker/docker-compose.prod.discord.yml'));
  assert.deepEqual(
    invocation.args.filter((item) => item === '--profile'),
    ['--profile', '--profile'],
  );
});

test('edge routes ignore non-edge (notification) profiles that have no Caddy fragment', () => {
  const invocation = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--profile=discord,notification-consumer,notification-scheduler'],
    {},
    {
      readProductionClosure: () =>
        closure('postgres', [...coreApps, 'discord-app-api', 'notification-consumer', 'notification-scheduler']),
    },
  );
  // notification-* run as background workers; only discord/telegram have Caddy
  // site/route fragments, so the edge token must not name a nonexistent fragment.
  assert.equal(invocation.env.EDGE_OPTIONAL_ROUTES, 'discord');
});

test('edge routes fall back to default when only non-edge profiles are set', () => {
  const invocation = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--profile=notification-consumer'],
    {},
    { readProductionClosure: () => closure('postgres', [...coreApps, 'notification-consumer']) },
  );
  assert.equal(invocation.env.EDGE_OPTIONAL_ROUTES, 'default');
});

test('COMPOSE_IMAGE_SOURCE=local adds the build overlay and builds on up', () => {
  const invocation = buildComposeInvocation(['up', '--env-file=.env.production.example', '--images=local'], {});
  assert.ok(invocation.files.includes('docker/docker-compose.prod.build.yml'));
  assert.ok(invocation.args.includes('--build'));
  assert.equal(invocation.imageSource, 'local');
});

test('image source defaults to registry and never becomes a required env key', () => {
  // Existing .env.production files predate COMPOSE_IMAGE_SOURCE; they must keep working.
  const invocation = buildComposeInvocation(['up', '--env-file=.env.production.example'], {});
  assert.equal(invocation.imageSource, 'registry');
  assert.ok(!invocation.files.includes('docker/docker-compose.prod.build.yml'));
  assert.ok(invocation.args.includes('--no-build'));
});

test('the build action still loads the build overlay regardless of image source', () => {
  // package.json docker:prod:build passes no flags and is a doc-pinned CI gate.
  const invocation = buildComposeInvocation(['build', '--env-file=.env.production.example'], {});
  assert.ok(invocation.files.includes('docker/docker-compose.prod.build.yml'));
});

test('env-provided image source is honoured without a CLI flag', () => {
  const invocation = buildComposeInvocation(['config', '--env-file=.env.production.example'], {
    COMPOSE_IMAGE_SOURCE: 'local',
  });
  assert.equal(invocation.imageSource, 'local');
  assert.ok(invocation.files.includes('docker/docker-compose.prod.build.yml'));
});

test('rejects an unknown image source', () => {
  assert.throws(
    () => buildComposeInvocation(['config', '--env-file=.env.production.example', '--images=ftp'], {}),
    /COMPOSE_IMAGE_SOURCE/u,
  );
});

test('rejects TLS ownership mismatches', () => {
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=automatic'],
        {},
      ),
    /external/u,
  );
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--domains=single-domain', '--tls=external'],
        {},
      ),
    /automatic.*provided/u,
  );
  assert.throws(
    () =>
      buildComposeInvocation(
        [
          'config',
          '--env-file=.env.production.example',
          '--domains=single-domain',
          '--tls=automatic',
          '--profile=telegram',
        ],
        {},
        { readProductionClosure: () => closure('postgres', [...coreApps, 'telegram-bot-api']) },
      ),
    /per-app-domains/u,
  );
});

test('uses immutable images by default and enables source builds only explicitly', () => {
  const sourceContextDependencies = {
    resolveSelectedProductClosureContext: () => '/tmp/nrb-selected-closure',
  };
  const imageOnly = buildComposeInvocation(['up', '--env-file=.env.production.example', '-d'], {});
  assert.equal(imageOnly.sourceBuild, false);
  assert.ok(!imageOnly.files.includes('docker/docker-compose.prod.build.yml'));
  assert.ok(imageOnly.args.includes('--no-build'));
  assert.equal(imageOnly.env.DOCKER_BUILDKIT, '1');

  const build = buildComposeInvocation(['build', '--env-file=.env.production.example'], {}, sourceContextDependencies);
  assert.equal(build.sourceBuild, true);
  assert.ok(build.files.includes('docker/docker-compose.prod.build.yml'));
  assert.equal(build.env.NRB_CLOSURE_CONTEXT, '/tmp/nrb-selected-closure');

  const sourceUp = buildComposeInvocation(
    ['up', '--env-file=.env.production.example', '--source-build'],
    {},
    sourceContextDependencies,
  );
  assert.equal(sourceUp.sourceBuild, true);
  assert.ok(sourceUp.files.includes('docker/docker-compose.prod.build.yml'));
  assert.ok(sourceUp.args.includes('--build'));
  assert.ok(!sourceUp.args.includes('--no-build'));

  assert.throws(
    () => buildComposeInvocation(['up', '--env-file=.env.production.example', '--source-build', '--no-build'], {}),
    /cannot be used together/u,
  );
  assert.throws(
    () => buildComposeInvocation(['up', '--env-file=.env.production.example', '--build'], {}),
    /--source-build/u,
  );
});

test('provider-free frontend selection omits databases, migrator, and backends', () => {
  const invocation = buildComposeInvocation(
    ['up', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { COMPOSE_DATABASE_MODE: '', DATABASE_ENGINE: '' },
    { readProductionClosure: () => closure(null, ['landing-app'], []) },
  );
  assert.equal(invocation.databaseEngine, null);
  assert.equal(invocation.databaseMode, undefined);
  assert.deepEqual(invocation.files, ['docker/docker-compose.prod.yml']);
  assert.deepEqual(invocation.selectedServices, ['landing-app']);
  assert.ok(!invocation.args.includes('migrate'));
  assert.ok(!invocation.args.includes('auth-app-api'));
  assert.equal(Object.hasOwn(invocation.env, 'LANDING_USER_APP_URL'), false);
  assert.equal(Object.hasOwn(invocation.env, 'LANDING_ADMIN_APP_URL'), false);
});

test('rejects positional and option-embedded references to unselected services', () => {
  const dependencies = { readProductionClosure: () => closure(null, ['landing-app'], []) };
  const environment = { COMPOSE_DATABASE_MODE: '', DATABASE_ENGINE: '' };
  assert.throws(
    () =>
      buildComposeInvocationBase(
        ['up', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external', 'admin-app'],
        environment,
        dependencies,
      ),
    /unselected service "admin-app"/u,
  );
  assert.throws(
    () =>
      buildComposeInvocationBase(
        [
          'up',
          '--env-file=.env.production.example',
          '--domains=external-proxy',
          '--tls=external',
          '--scale=auth-app-api=2',
        ],
        environment,
        dependencies,
      ),
    /unselected service "auth-app-api"/u,
  );
  assert.doesNotThrow(() =>
    buildComposeInvocationBase(
      ['logs', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external', 'landing-app'],
      environment,
      dependencies,
    ),
  );
});

test('derives optional profiles from selected apps and rejects profile leakage', () => {
  const selected = closure('postgres', ['auth-app-api', 'user-app-api'], ['migrate', 'postgres']);
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--profile=telegram'],
        {},
        {
          readProductionClosure: () => selected,
        },
      ),
    /cannot enable unselected app/u,
  );
});

test('rejects an unselected apex app when Compose owns the edge', () => {
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example'],
        { COMPOSE_DATABASE_MODE: '', DATABASE_ENGINE: '' },
        { readProductionClosure: () => closure(null, ['site-app'], []) },
      ),
    /PRIMARY_APP must be selected/u,
  );
});
