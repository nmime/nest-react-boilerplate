// @requirements REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { assertTenantChangeAllowed } from './io.js';

function filesystem(paths: string[] = []): FilesystemAdapter {
  const files = new Set(paths);
  return {
    async read() {
      return null;
    },
    async write(path) {
      files.add(path);
    },
    async delete(path) {
      files.delete(path);
    },
    async exists(path) {
      return files.has(path);
    },
    async list() {
      return [...files];
    },
  };
}

describe('tenant change guard', () => {
  it('allows a checkout with no seed marker and no configured database', async () => {
    await assertTenantChangeAllowed('.', filesystem(), { databaseUrl: '' });
  });

  it('refuses every supported seed marker before probing the database', async () => {
    for (const marker of ['.nrb/seeded', '.nrb/seed.json', '.nrb/seed-state.json']) {
      await assert.rejects(
        assertTenantChangeAllowed('.', filesystem([marker]), {
          databaseUrl: 'postgres://localhost/app',
          runPostgresProbe: () => {
            throw new Error('probe must not run');
          },
        }),
        new RegExp(marker.replaceAll('.', '\\.')),
      );
    }
  });

  it('fails closed for malformed or unsupported database URLs', async () => {
    await assert.rejects(assertTenantChangeAllowed('.', filesystem(), { databaseUrl: 'not a url' }), /malformed/u);
    await assert.rejects(
      assertTenantChangeAllowed('.', filesystem(), { databaseUrl: 'mongodb://localhost/app' }),
      /unsupported protocol/u,
    );
  });

  it('allows a successful fresh-database probe', async () => {
    await assertTenantChangeAllowed('.', filesystem(), {
      databaseUrl: 'postgres://localhost/app',
      runPostgresProbe: () => ({ status: 0, stdout: 'fresh\n', stderr: '' }),
    });
  });

  it('loads a configured database from .env instead of treating a missing process variable as fresh', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-'));
    try {
      writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://localhost/app\n');
      await assert.rejects(
        assertTenantChangeAllowed(root, filesystem(), {
          databaseUrl: '',
          runPostgresProbe: () => ({ status: 0, stdout: 'applied\n', stderr: '' }),
        }),
        /applied migrations/u,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('supports MongoDB migration-ledger probes and refuses incomplete or ambiguous configuration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-mongo-'));
    try {
      await assertTenantChangeAllowed(root, filesystem(), {
        mongodbUri: 'mongodb://localhost/app',
        mongodbDatabase: 'app',
        runMongoProbe: async () => 'fresh',
      });
      await assert.rejects(
        assertTenantChangeAllowed(root, filesystem(), {
          mongodbUri: 'mongodb://localhost/app',
          mongodbDatabase: 'app',
          runMongoProbe: async () => 'applied',
        }),
        /applied migrations/u,
      );
      await assert.rejects(
        assertTenantChangeAllowed(root, filesystem(), { mongodbUri: 'mongodb://localhost/app' }),
        /incomplete/u,
      );
      await assert.rejects(
        assertTenantChangeAllowed(root, filesystem(), {
          databaseUrl: 'postgres://localhost/app',
          mongodbUri: 'mongodb://localhost/app',
          mongodbDatabase: 'app',
        }),
        /both PostgreSQL and MongoDB/u,
      );
      await assert.rejects(
        assertTenantChangeAllowed(root, filesystem(), {
          mongodbUri: 'mongodb://localhost/other',
          mongodbDatabase: 'app',
        }),
        /disagree/u,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('refuses applied migrations, missing psql, failed probes, and ambiguous output', async () => {
    await assert.rejects(
      assertTenantChangeAllowed('.', filesystem(), {
        databaseUrl: 'postgres://localhost/app',
        runPostgresProbe: () => ({ status: 0, stdout: 'applied\n', stderr: '' }),
      }),
      /applied migrations/u,
    );
    await assert.rejects(
      assertTenantChangeAllowed('.', filesystem(), {
        databaseUrl: 'postgres://localhost/app',
        runPostgresProbe: () => ({ status: null, stdout: '', stderr: '', error: new Error('spawn psql ENOENT') }),
      }),
      /could not be checked.*ENOENT/u,
    );
    await assert.rejects(
      assertTenantChangeAllowed('.', filesystem(), {
        databaseUrl: 'postgres://localhost/app',
        runPostgresProbe: () => ({ status: 2, stdout: '', stderr: 'connection refused' }),
      }),
      /failed migration-state probe.*connection refused/u,
    );
    await assert.rejects(
      assertTenantChangeAllowed('.', filesystem(), {
        databaseUrl: 'postgres://localhost/app',
        runPostgresProbe: () => ({ status: 0, stdout: '', stderr: '' }),
      }),
      /unexpected result/u,
    );
  });
});
