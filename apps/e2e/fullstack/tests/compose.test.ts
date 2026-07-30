// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { resolveFullstackSelection, validateFullstackEnvironment } from '../src/selection.ts';

const roots: string[] = [];

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
      const { composeEnv, databaseProvider, stackServices } = await import(`../src/compose.ts?fixture=${Date.now()}`);
      assert.equal(databaseProvider, 'mongodb');
      assert.deepEqual(stackServices, ['auth-app-api', 'mongodb', 'mongodb-init', 'mongodb-migrate', 'user-app']);
      assert.equal(composeEnv.COMPOSE_PROFILES, 'auth-app-api,mongodb,user-app');
      assert.equal(composeEnv.DATABASE_URL, undefined);
      assert.equal(
        composeEnv.MONGODB_URI,
        'mongodb://mongodb.localhost:47123/fullstack_test?replicaSet=rs0&retryWrites=true',
      );
      assert.equal(composeEnv.MONGODB_DATABASE, 'fullstack_test');
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

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
