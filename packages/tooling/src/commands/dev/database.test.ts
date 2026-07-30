// @requirements REQ-RUNTIME-DATABASE-008
import assert from 'node:assert/strict';
import { spawnSync, type SpawnOptions } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveDevDatabaseRuntime, runDevDatabase } from './database.ts';
import { readConfiguredClosure } from '../../setup/closure-workspace.ts';

const providerEnvironment = {
  mongodb: [
    'NRB_CAPABILITIES=mongodb',
    'COMPOSE_PROFILES=mongodb,user-app-api',
    'DATABASE_ENGINE=mongodb',
    'AUTH_PERSISTENCE=mongodb',
    'MONGODB_URI=mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0&retryWrites=true',
    'MONGODB_DATABASE=nest_react_boilerplate',
    'MONGODB_REPLICA_SET=rs0',
    '',
  ].join('\n'),
  postgres: [
    'NRB_CAPABILITIES=postgres',
    'COMPOSE_PROFILES=postgres,user-app-api',
    'DATABASE_ENGINE=postgres',
    'AUTH_PERSISTENCE=postgres',
    'DATABASE_URL=postgres://postgres:postgres@localhost:5432/nest_react_boilerplate',
    'CONTAINER_DATABASE_URL=postgres://postgres:postgres@postgres:5432/nest_react_boilerplate',
    '',
  ].join('\n'),
} as const;

const validateFixtureClosure = async (workspaceRoot: string) => readConfiguredClosure(workspaceRoot);

function createSelection(
  provider: 'mongodb' | 'postgres' | null,
  environmentProvider: keyof typeof providerEnvironment,
): string {
  const root = mkdtempSync(join(tmpdir(), 'nrb-dev-database-'));
  mkdirSync(join(root, '.nrb'));
  writeFileSync(
    join(root, '.nrb', 'closure.json'),
    JSON.stringify({
      schemaVersion: 1,
      configHash: 'a'.repeat(64),
      graphDigest: 'b'.repeat(64),
      provider,
      roots: ['user-app-api'],
      projects: ['user-app-api'],
      targets: { serve: ['user-app-api'] },
      productExternalPackages: {},
      toolingExternalPackages: {},
      services: ['user-app-api'],
      releaseImages: ['user-app-api'],
    }),
  );
  writeFileSync(join(root, '.nrb', 'capabilities.env'), providerEnvironment[environmentProvider]);
  return root;
}

describe('dev database', () => {
  it('registers nrb dev database in the CLI', () => {
    const result = spawnSync(
      process.execPath,
      ['packages/tooling/bin/repo-tooling.mjs', 'dev', 'database', '--help'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: pnpm nrb dev:database/u);
  });

  it('starts only PostgreSQL for a PostgreSQL selection', async () => {
    const root = createSelection('postgres', 'postgres');
    const calls: Array<{ command: string; args: string[]; options?: SpawnOptions }> = [];
    try {
      await runDevDatabase(
        root,
        async (command, args, options) => {
          calls.push({ command, args, options });
        },
        process.env,
        validateFixtureClosure,
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.command, 'docker');
      assert.deepEqual(calls[0]?.args.slice(-3), ['up', '-d', 'postgres']);
      assert.equal(calls[0]?.args.includes('mongodb'), false);
      assert.equal(calls[0]?.args.includes('mongodb-init'), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('starts only MongoDB and its replica-set initializer for a MongoDB selection', async () => {
    const root = createSelection('mongodb', 'mongodb');
    const calls: Array<{ command: string; args: string[]; options?: SpawnOptions }> = [];
    try {
      await runDevDatabase(
        root,
        async (command, args, options) => {
          calls.push({ command, args, options });
        },
        process.env,
        validateFixtureClosure,
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.command, 'docker');
      assert.deepEqual(calls[0]?.args.slice(-4), ['up', '-d', 'mongodb', 'mongodb-init']);
      assert.equal(calls[0]?.args.includes('postgres'), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a provider-free closure before invoking Docker', async () => {
    const root = createSelection(null, 'postgres');
    let calls = 0;
    try {
      await assert.rejects(
        runDevDatabase(
          root,
          async () => {
            calls += 1;
          },
          process.env,
          validateFixtureClosure,
        ),
        /provider-free/u,
      );
      assert.equal(calls, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects disagreement between closure and generated environment selections', async () => {
    const root = createSelection('mongodb', 'postgres');
    try {
      await assert.rejects(
        resolveDevDatabaseRuntime(root, process.env, validateFixtureClosure),
        /fresh closure selects mongodb/u,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
