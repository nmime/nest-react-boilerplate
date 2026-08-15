// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  fullstackStartupPlan,
  readinessProbes,
  resolveFullstackSelection,
  validateFullstackEnvironment,
} from '../src/selection.ts';

const roots: string[] = [];

const workspaceRoot = new URL('../../../../', import.meta.url);
const readWorkspaceFile = (path: string): string => readFileSync(new URL(path, workspaceRoot), 'utf8');

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

void describe('fullstack selected closure', () => {
  void it('requires fullstack-e2e and an explicit provider without a PostgreSQL fallback', () => {
    assert.throws(
      () => resolveFullstackSelection({ provider: 'postgres', roots: ['user-app'], services: ['user-app'] }),
      /requires fullstack-e2e/u,
    );
    assert.throws(
      () => resolveFullstackSelection({ provider: null, roots: ['fullstack-e2e'], services: [] }),
      /explicitly selected/u,
    );
  });

  void it('derives every selected application, capability service, provider, and profile', () => {
    const selection = resolveFullstackSelection({
      provider: 'mongodb',
      roots: ['auth-app-api', 'discord-app-api', 'fullstack-e2e', 'user-app'],
      services: ['auth-app-api', 'discord-app-api', 'minio', 'mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app'],
    });
    assert.deepEqual(selection.applicationServices, ['auth-app-api', 'discord-app-api', 'user-app']);
    assert.deepEqual(selection.profiles, ['auth-app-api', 'discord-app-api', 'mongodb', 's3', 'user-app']);
    assert.equal(selection.migrationService, 'mongodb-migrate');
    assert.equal(selection.databaseService, 'mongodb');
  });

  void it('rejects stale profile, provider, opposite-provider, and service-reduction environment leakage', () => {
    const selection = resolveFullstackSelection({
      provider: 'postgres',
      roots: ['fullstack-e2e', 'user-app'],
      services: ['migrate', 'postgres', 'user-app'],
    });
    assert.doesNotThrow(() => {
      validateFullstackEnvironment(selection, {});
    });
    assert.throws(() => {
      validateFullstackEnvironment(selection, { DATABASE_ENGINE: 'mongodb' });
    }, /conflicts/u);
    assert.throws(() => {
      validateFullstackEnvironment(selection, { MONGODB_URI: 'mongodb://localhost/db' });
    }, /opposite-provider/u);
    assert.throws(() => {
      validateFullstackEnvironment(selection, { COMPOSE_PROFILES: 'postgres,user-app,admin-app' });
    }, /stale or unselected/u);
    assert.throws(() => {
      validateFullstackEnvironment(selection, { FULLSTACK_CRITICAL_ONLY: 'true' });
    }, /unsupported/u);
  });

  void it('loads Compose only from an explicit selected closure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-fullstack-selection-'));
    roots.push(root);
    mkdirSync(join(root, '.nrb'), { recursive: true });
    writeFileSync(
      join(root, '.nrb/closure.json'),
      JSON.stringify({
        provider: 'mongodb',
        roots: ['auth-app-api', 'fullstack-e2e', 'user-app'],
        services: ['auth-app-api', 'mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app'],
      }),
    );
    const originalRoot = process.env.NRB_WORKSPACE_ROOT;
    const originalMongoPort = process.env.MONGODB_PORT;
    const originalMongoUri = process.env.MONGODB_URI;
    const originalMongoDatabase = process.env.MONGODB_DATABASE;
    const originalDockerMongoUri = process.env.DOCKER_MONGODB_URI;
    process.env.NRB_WORKSPACE_ROOT = root;
    process.env.MONGODB_PORT = '47123';
    process.env.MONGODB_URI = 'mongodb://mongodb.localhost:27017/stale?replicaSet=rs0&retryWrites=true';
    process.env.MONGODB_DATABASE = 'fullstack_test';
    delete process.env.DOCKER_MONGODB_URI;
    try {
      const { composeEnv, databaseProvider, stackServices, urls } = await import(
        `../src/compose.ts?fixture=${Date.now()}`
      );
      assert.equal(databaseProvider, 'mongodb');
      assert.deepEqual(stackServices, ['auth-app-api', 'mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app']);
      assert.equal(composeEnv.COMPOSE_PROFILES, 'auth-app-api,mongodb,user-app');
      assert.equal(composeEnv.DATABASE_URL, undefined);
      assert.equal(
        composeEnv.MONGODB_URI,
        'mongodb://mongodb.localhost:47123/fullstack_test?replicaSet=rs0&retryWrites=true',
      );
      assert.equal(composeEnv.MONGODB_DATABASE, 'fullstack_test');
      assert.equal(composeEnv.FRONTEND_RUNTIME_ALLOW_LOOPBACK_HTTP, 'true');
      assert.equal(composeEnv.LANDING_ADMIN_APP_URL, urls.adminApp);
      assert.equal(composeEnv.LANDING_USER_APP_URL, urls.userApp);
      assert.equal(Buffer.from(composeEnv.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY, 'base64').byteLength, 32);
      assert.doesNotMatch(composeEnv.COMPOSE_PROFILES ?? '', /(^|,)postgres(,|$)/u);
    } finally {
      restoreEnv('NRB_WORKSPACE_ROOT', originalRoot);
      restoreEnv('MONGODB_PORT', originalMongoPort);
      restoreEnv('MONGODB_URI', originalMongoUri);
      restoreEnv('MONGODB_DATABASE', originalMongoDatabase);
      restoreEnv('DOCKER_MONGODB_URI', originalDockerMongoUri);
    }
  });
});

void describe('fullstack startup order', () => {
  const selectionFor = (provider: 'mongodb' | 'postgres') =>
    resolveFullstackSelection({
      provider,
      roots: ['fullstack-e2e', 'user-app', 'user-app-api'],
      services:
        provider === 'mongodb'
          ? ['mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app', 'user-app-api']
          : ['migrate', 'postgres', 'user-app', 'user-app-api'],
    });

  void it('waits for the database to report healthy before running the migrator against it', () => {
    for (const provider of ['mongodb', 'postgres'] as const) {
      const selection = selectionFor(provider);
      const plan = fullstackStartupPlan(selection);
      const healthGate = plan.findIndex(
        (step) =>
          step.kind === 'up' && step.waitForHealthy === true && step.services.includes(selection.databaseService),
      );
      const migrationStep = plan.findIndex(
        (step) => step.kind === 'run' && step.services.includes(selection.migrationService),
      );

      assert.deepEqual(
        plan[0]?.services,
        [selection.databaseService],
        `${provider} must start its database before anything else`,
      );
      assert.ok(healthGate >= 0, `${provider} must wait for ${selection.databaseService} to report healthy`);
      assert.ok(
        healthGate < migrationStep,
        `${provider} must reach that gate before running ${selection.migrationService}`,
      );
    }
  });

  // A `--replSet` mongod answers `isWritablePrimary: false` until `rs.initiate()` has run, and running
  // it is mongodb-init's job. Gating on health first waits for a condition only a later step can
  // create, so the wait can only ever time out — a deadlock, not a slow start.
  void it('never gates on database health before the bootstrap that makes health reachable', () => {
    const selection = selectionFor('mongodb');
    const plan = fullstackStartupPlan(selection);
    const bootstrap = plan.findIndex((step) => step.kind === 'run' && step.services.includes('mongodb-init'));
    const healthGate = plan.findIndex((step) => step.kind === 'up' && step.waitForHealthy === true);

    assert.ok(bootstrap >= 0, 'mongodb must initiate its replica set');
    assert.ok(bootstrap < healthGate, 'the replica set must be initiated before anything waits for health');
  });

  void it('runs the migrator to completion before any application service starts', () => {
    // The defect this pins is silent: `docker compose up -d` honours `depends_on` ordering but does
    // not wait for a one-shot to exit, so an application whose only declared dependency is the
    // database boots against an unmigrated schema and the suite fails somewhere else entirely.
    for (const provider of ['mongodb', 'postgres'] as const) {
      const selection = selectionFor(provider);
      const plan = fullstackStartupPlan(selection);
      const migrationStep = plan.findIndex(
        (step) => step.kind === 'run' && step.services.includes(selection.migrationService),
      );
      const applicationStep = plan.findIndex((step) =>
        selection.applicationServices.some((service) => step.services.includes(service)),
      );

      assert.ok(migrationStep >= 0, `${provider} must run ${selection.migrationService} as a one-shot`);
      assert.ok(applicationStep >= 0, `${provider} must start its application services`);
      assert.ok(
        migrationStep < applicationStep,
        `${provider} must finish ${selection.migrationService} before starting applications`,
      );
    }
  });

  void it('orders MongoDB replica-set initialization ahead of its migrator', () => {
    const selection = selectionFor('mongodb');
    const plan = fullstackStartupPlan(selection);
    const oneShots = plan.filter((step) => step.kind === 'run').flatMap((step) => step.services);

    assert.deepEqual(oneShots, ['mongodb-init', 'mongodb-migrate']);
  });

  void it('starts every selected service, repeating only the database it has to gate on', () => {
    const byName = (left: string, right: string) => left.localeCompare(right);

    for (const provider of ['mongodb', 'postgres'] as const) {
      const selection = selectionFor(provider);
      const plan = fullstackStartupPlan(selection);
      const started = plan.flatMap((step) => step.services);

      assert.deepEqual(
        [...new Set(started)].sort(byName),
        [...selection.services].sort(byName),
        `${provider} must start each selected service`,
      );
      // A second `up` of the database is the health gate, not a restart: Compose leaves a running
      // container alone and only waits on it. Anything else appearing twice is a real duplicate.
      assert.deepEqual(
        started.filter((service, index) => started.indexOf(service) !== index),
        provider === 'mongodb' ? [selection.databaseService] : [],
        `${provider} must not start any other service twice`,
      );
    }
  });
});

void describe('fullstack readiness probes', () => {
  /** Entry documents the three SPA services serve at `/`, which is what a readiness probe reads. */
  const frontendDocuments = [
    { service: 'admin-app', path: 'apps/frontend/admin/index.html' },
    { service: 'landing-app', path: 'apps/frontend/landing/src/astro/pages/index.astro' },
    { service: 'user-app', path: 'apps/frontend/app/index.html' },
  ] as const;
  const selection = resolveFullstackSelection({
    provider: 'postgres',
    roots: [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'fullstack-e2e',
      'landing-app',
      'notification-consumer',
      'site-app',
      'user-app',
      'user-app-api',
    ],
    services: [
      'admin-app',
      'admin-app-api',
      'auth-app-api',
      'landing-app',
      'migrate',
      'notification-consumer',
      'postgres',
      'site-app',
      'user-app',
      'user-app-api',
    ],
  });

  void it('probes every selected service that answers over HTTP', () => {
    // notification-consumer is selected and has no HTTP surface at all, so it contributes no
    // probe -- Compose readiness is the only thing that can speak for it.
    assert.deepEqual(readinessProbes(selection), [
      { service: 'admin-app', path: '/', marker: 'data-app="admin-app"' },
      { service: 'admin-app-api', path: '/health', marker: 'admin-app-api' },
      { service: 'auth-app-api', path: '/health', marker: 'auth-app-api' },
      { service: 'landing-app', path: '/', marker: 'data-app="landing-app"' },
      { service: 'site-app', path: '/ready', marker: 'site-app' },
      { service: 'user-app', path: '/', marker: 'data-app="user-app"' },
      { service: 'user-app-api', path: '/health', marker: 'user-app-api' },
    ]);
  });

  void it('never gates readiness on copy the product owns', () => {
    const markers = readinessProbes(selection).map((probe) => probe.marker);

    for (const { path } of frontendDocuments) {
      const source = readWorkspaceFile(path);
      const title = /<title>([\s\S]*?)<\/title>/u.exec(source)?.[1] ?? '';

      // The build rewrites every shipped title from VITE_PRODUCT_NAME, so a probe matching one
      // asserts that nobody has renamed the product -- the first thing every product does.
      assert.ok(!markers.includes(title), `${path}: readiness must not match the shipped title "${title}"`);
      assert.ok(
        !source.includes('Nest React Boilerplate'),
        `${path} hardcodes the boilerplate product name instead of rendering the configured brand`,
      );
    }
  });

  void it('matches a marker the shipped document actually carries', () => {
    const probes = readinessProbes(selection);

    for (const { service, path } of frontendDocuments) {
      const probe = probes.find((candidate) => candidate.service === service);

      assert.ok(probe, `${service} must have a readiness probe`);
      assert.ok(
        readWorkspaceFile(path).includes(probe.marker),
        `${path} must carry ${probe.marker} or the probe waits for text that is never served`,
      );
    }
  });

  void it('drives the managed stack from the derived probes', () => {
    const globalSetup = readWorkspaceFile('apps/e2e/fullstack/src/global-setup.ts');

    assert.match(globalSetup, /readinessProbes\(/u);
    assert.doesNotMatch(globalSetup, /'User App'|'Admin App'|Nest React Boilerplate/u);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
