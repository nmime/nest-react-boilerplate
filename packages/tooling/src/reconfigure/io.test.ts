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

/**
 * The guard reads the ambient environment after the explicit options, and Nx loads the workspace
 * `.env`/`.env.local` into every command it runs. Pinning that source empty keeps each case about
 * the fixture checkout under test instead of about the host that happens to run the suite.
 */
const isolatedAmbientEnvironment: NodeJS.ProcessEnv = {};

function assertTenantChangeAllowedIn(
  root: string,
  fs: FilesystemAdapter,
  options: Parameters<typeof assertTenantChangeAllowed>[2] = {},
) {
  return assertTenantChangeAllowed(root, fs, { ...options, ambientEnvironment: isolatedAmbientEnvironment });
}

describe('tenant change guard', () => {
  it('allows a checkout with no seed marker and no configured database', async () => {
    // Isolated root: a host checkout's .env may configure a live database, and
    // an empty databaseUrl must mean "unconfigured", not "read the host env".
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-empty-'));
    try {
      await assertTenantChangeAllowedIn(root, filesystem(), { databaseUrl: '' });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('refuses every supported seed marker before probing the database', async () => {
    // Isolated root: the guard reads `<root>/.env`, and a host checkout's .env may configure a
    // live database that would otherwise decide the outcome before the marker check.
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-marker-'));
    try {
      for (const marker of ['.nrb/seeded', '.nrb/seed.json', '.nrb/seed-state.json']) {
        await assert.rejects(
          assertTenantChangeAllowedIn(root, filesystem([marker]), {
            databaseUrl: 'postgres://localhost/app',
            runPostgresProbe: () => {
              throw new Error('probe must not run');
            },
          }),
          new RegExp(marker.replaceAll('.', '\\.')),
        );
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('fails closed for malformed or unsupported database URLs', async () => {
    // Isolated root: a host checkout's .env may configure a live database, which would trip the
    // "both PostgreSQL and MongoDB are configured" guard before URL validation runs.
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-url-'));
    try {
      await assert.rejects(assertTenantChangeAllowedIn(root, filesystem(), { databaseUrl: 'not a url' }), /malformed/u);
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), { databaseUrl: 'mongodb://localhost/app' }),
        /unsupported protocol/u,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('allows a successful fresh-database probe', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-fresh-'));
    try {
      await assertTenantChangeAllowedIn(root, filesystem(), {
        databaseUrl: 'postgres://localhost/app',
        runPostgresProbe: () => ({ status: 0, stdout: 'fresh\n', stderr: '' }),
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('loads a configured database from .env instead of treating a missing process variable as fresh', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-'));
    try {
      writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://localhost/app\n');
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
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
      await assertTenantChangeAllowedIn(root, filesystem(), {
        mongodbUri: 'mongodb://localhost/app',
        mongodbDatabase: 'app',
        runMongoProbe: async () => 'fresh',
      });
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
          mongodbUri: 'mongodb://localhost/app',
          mongodbDatabase: 'app',
          runMongoProbe: async () => 'applied',
        }),
        /applied migrations/u,
      );
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), { mongodbUri: 'mongodb://localhost/app' }),
        /incomplete/u,
      );
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
          databaseUrl: 'postgres://localhost/app',
          mongodbUri: 'mongodb://localhost/app',
          mongodbDatabase: 'app',
        }),
        /both PostgreSQL and MongoDB/u,
      );
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
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
    // Isolated root: a host checkout's .env may configure a live database, which would trip
    // the "both PostgreSQL and MongoDB are configured" guard before the probe assertions.
    const root = mkdtempSync(join(tmpdir(), 'nrb-tenant-guard-probe-'));
    try {
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
          databaseUrl: 'postgres://localhost/app',
          runPostgresProbe: () => ({ status: 0, stdout: 'applied\n', stderr: '' }),
        }),
        /applied migrations/u,
      );
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
          databaseUrl: 'postgres://localhost/app',
          runPostgresProbe: () => ({ status: null, stdout: '', stderr: '', error: new Error('spawn psql ENOENT') }),
        }),
        /could not be checked.*ENOENT/u,
      );
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
          databaseUrl: 'postgres://localhost/app',
          runPostgresProbe: () => ({ status: 2, stdout: '', stderr: 'connection refused' }),
        }),
        /failed migration-state probe.*connection refused/u,
      );
      await assert.rejects(
        assertTenantChangeAllowedIn(root, filesystem(), {
          databaseUrl: 'postgres://localhost/app',
          runPostgresProbe: () => ({ status: 0, stdout: '', stderr: '' }),
        }),
        /unexpected result/u,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
