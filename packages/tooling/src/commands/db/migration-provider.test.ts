// @requirements REQ-RUNTIME-DATABASE-008
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SelectedClosureManifest } from '../../setup/closure.js';
import {
  deploymentDatabaseProviderResolver,
  resolveDatabaseMigrationProvider,
} from './migration-provider.ts';

const closure = (provider: 'postgres' | 'mongodb' | null) =>
  async () => ({ provider }) as SelectedClosureManifest;

describe('database migration provider', () => {
  it('uses PostgreSQL only when the current closure owns PostgreSQL', async () => {
    assert.equal(await resolveDatabaseMigrationProvider({}, '/workspace', closure('postgres')), 'postgres');
    assert.equal(
      await resolveDatabaseMigrationProvider({ AUTH_PERSISTENCE: 'memory' }, '/workspace', closure('postgres')),
      'postgres',
    );
  });

  it('uses MongoDB only when the current closure owns MongoDB', async () => {
    assert.equal(await resolveDatabaseMigrationProvider({}, '/workspace', closure('mongodb')), 'mongodb');
    assert.equal(
      await resolveDatabaseMigrationProvider(
        { AUTH_PERSISTENCE: ' MongoDB ', DATABASE_ENGINE: 'mongodb' },
        '/workspace',
        closure('mongodb'),
      ),
      'mongodb',
    );
  });

  it('rejects provider-free closure, environment drift, and stale validation', async () => {
    await assert.rejects(
      resolveDatabaseMigrationProvider({}, '/workspace', closure(null)),
      /selected closure is provider-free/u,
    );
    await assert.rejects(
      resolveDatabaseMigrationProvider({ DATABASE_ENGINE: 'postgres' }, '/workspace', closure('mongodb')),
      /selected closure uses mongodb/u,
    );
    await assert.rejects(
      resolveDatabaseMigrationProvider({}, '/workspace', async () => {
        throw new Error('Selected closure live graph digest is stale; rerun `pnpm nrb setup`.');
      }),
      /live graph digest is stale/u,
    );
  });

  it('rejects unknown and conflicting environment providers', async () => {
    await assert.rejects(
      resolveDatabaseMigrationProvider({ AUTH_PERSISTENCE: 'mongo' }, '/workspace', closure('postgres')),
      /AUTH_PERSISTENCE/u,
    );
    await assert.rejects(
      resolveDatabaseMigrationProvider({ DATABASE_ENGINE: 'mysql' }, '/workspace', closure('postgres')),
      /DATABASE_ENGINE/u,
    );
    await assert.rejects(
      resolveDatabaseMigrationProvider(
        { AUTH_PERSISTENCE: 'mongodb', DATABASE_ENGINE: 'postgres' },
        '/workspace',
        closure('postgres'),
      ),
      /different database providers/u,
    );
  });

  it('exposes a filesystem-free deployment-only resolver contract', () => {
    assert.equal(
      deploymentDatabaseProviderResolver.resolve({
        environment: { DATABASE_ENGINE: 'mongodb', AUTH_PERSISTENCE: 'mongodb' },
      }),
      'mongodb',
    );
    assert.throws(
      () => deploymentDatabaseProviderResolver.resolve({ environment: {} }),
      /AUTH_PERSISTENCE must explicitly select/u,
    );
  });

});
