import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { resolveMigratorDeploymentProvider, runMigrator } from './migrator-run.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('standalone deployment migrator', () => {
  it('dispatches PostgreSQL and MongoDB from matching deployment selectors', async () => {
    const migrated = [];
    assert.equal(
      await runMigrator({
        environment: { DATABASE_ENGINE: 'postgres', AUTH_PERSISTENCE: 'postgres' },
        migrate: async () => migrated.push('postgres'),
      }),
      'postgres',
    );
    assert.equal(
      await runMigrator({
        environment: { DATABASE_ENGINE: 'mongodb', AUTH_PERSISTENCE: 'mongodb' },
        migrate: async () => migrated.push('mongodb'),
      }),
      'mongodb',
    );
    assert.deepEqual(migrated, ['postgres', 'mongodb']);
  });

  it('rejects missing or incomplete deployment selectors', async () => {
    await assert.rejects(resolveMigratorDeploymentProvider({}), /AUTH_PERSISTENCE must explicitly select/u);
    await assert.rejects(
      resolveMigratorDeploymentProvider({ DATABASE_ENGINE: 'postgres' }),
      /AUTH_PERSISTENCE must explicitly select/u,
    );
    await assert.rejects(
      resolveMigratorDeploymentProvider({ AUTH_PERSISTENCE: 'postgres' }),
      /DATABASE_ENGINE must explicitly select/u,
    );
  });

  it('rejects conflicting deployment selectors', async () => {
    await assert.rejects(
      resolveMigratorDeploymentProvider({ DATABASE_ENGINE: 'postgres', AUTH_PERSISTENCE: 'mongodb' }),
      /different database providers/u,
    );
  });

  it('resolves a deployment provider when the runtime filesystem has no .nrb state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-migrator-runtime-'));
    temporaryRoots.push(root);
    assert.equal(existsSync(join(root, '.nrb')), false);

    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      assert.equal(
        await resolveMigratorDeploymentProvider({ DATABASE_ENGINE: 'mongodb', AUTH_PERSISTENCE: 'mongodb' }),
        'mongodb',
      );
    } finally {
      process.chdir(previousCwd);
    }
  });
});
