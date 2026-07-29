import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseSelectedClosure, type SelectedClosureManifest } from '../../setup/closure.js';
import {
  readClosureLockStatus,
  synchronizeClosureArtifacts,
  writeClosureLockMetadata,
} from '../../setup/closure-materializer.js';
import { runClosureCommand } from './closure.js';

function closure(): SelectedClosureManifest {
  return parseSelectedClosure({
    schemaVersion: 1,
    configHash: 'a'.repeat(64),
    graphDigest: 'b'.repeat(64),
    provider: null,
    roots: ['landing-app'],
    projects: ['landing-app'],
    targets: { build: ['landing-app'], serve: ['landing-app'] },
    productExternalPackages: {},
    toolingExternalPackages: { nx: '23.1.0' },
    services: ['landing-app'],
    releaseImages: ['landing-app'],
  });
}

function rootWithClosure(): string {
  const root = mkdtempSync(join(tmpdir(), 'nrb-closure-command-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.11.0', engines: {} }));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n\noverrides:\n  nx: 23.1.0\n");
  writeFileSync(join(root, 'nrb.config.json'), '{"schemaVersion":1}\n');
  mkdirSync(join(root, '.nrb'), { recursive: true });
  writeFileSync(join(root, '.nrb/workspace.json'), '{"schemaVersion":1}\n');
  writeFileSync(join(root, 'nrb.config.json'), '{"schemaVersion":1}\n');
  mkdirSync(join(root, '.nrb'), { recursive: true });
  writeFileSync(join(root, '.nrb/workspace.json'), '{"schemaVersion":1}\n');
  mkdirSync(join(root, 'apps/landing-app/node_modules'), { recursive: true });
  writeFileSync(join(root, 'apps/landing-app/project.json'), JSON.stringify({ name: 'landing-app' }));
  writeFileSync(join(root, 'apps/landing-app/node_modules/stale-marker'), 'stale');
  synchronizeClosureArtifacts(root, closure());
  return root;
}

describe('closure command', () => {
  it('rejects a missing manifest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-closure-command-'));
    const original = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const status = await runClosureCommand(
        { argv: ['check'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => closure() },
      );
      assert.equal(status, 1);
    } finally {
      process.stderr.write = original;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects stale closure content', async () => {
    const root = rootWithClosure();
    const original = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const stale = { ...closure(), graphDigest: 'c'.repeat(64) };
      writeFileSync(join(root, '.nrb/closure.json'), `${JSON.stringify(stale, null, 2)}\n`);
      const status = await runClosureCommand(
        { argv: ['check'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => closure() },
      );
      assert.equal(status, 1);
    } finally {
      process.stderr.write = original;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs an exact selected target and rejects target/project escape attempts', async () => {
    const root = rootWithClosure();
    const calls: Array<{ command: string; args: string[] }> = [];
    const execute = (command: string, args: string[]) => {
      calls.push({ command, args });
      return { command, args, status: 0, stdout: '', stderr: '' } as never;
    };
    const original = process.stderr.write;
    process.stderr.write = () => true;
    try {
      assert.equal(
        await runClosureCommand(
          { argv: ['run', 'build'], packageRoot: '', workspaceRoot: root },
          { buildExpected: async () => closure(), execute },
        ),
        0,
      );
      assert.deepEqual(calls[0], {
        command: 'pnpm',
        args: ['exec', 'nx', 'run-many', '-t', 'build', '--projects=landing-app'],
      });
      assert.equal(
        await runClosureCommand(
          { argv: ['run', 'test'], packageRoot: '', workspaceRoot: root },
          { buildExpected: async () => closure(), execute },
        ),
        1,
      );
      assert.equal(
        await runClosureCommand(
          { argv: ['run', 'build', '--', '--projects=site-app'], packageRoot: '', workspaceRoot: root },
          { buildExpected: async () => closure(), execute },
        ),
        1,
      );
    } finally {
      process.stderr.write = original;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('regenerates a stale selected lock and records current metadata', async () => {
    const root = rootWithClosure();
    const lockPath = join(root, '.nrb/closure/pnpm-lock.yaml');
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    writeFileSync(lockPath, 'lockfileVersion: 9\nold: true\n');
    writeClosureLockMetadata(root, closure());
    writeFileSync(lockPath, 'lockfileVersion: 9\nstale: true\n');

    try {
      const status = await runClosureCommand(
        { argv: ['install'], packageRoot: '', workspaceRoot: root },
        {
          buildExpected: async () => closure(),
          execute: (command, args, options) => {
            calls.push({ command, args, cwd: options.cwd });
            if (args.includes('--lockfile-only')) {
              writeFileSync(lockPath, 'lockfileVersion: 9\ncurrent: true\n');
            } else {
              mkdirSync(join(root, '.nrb/closure/node_modules'), { recursive: true });
            }
            return { command, args, status: 0, stdout: '', stderr: '' } as never;
          },
        },
      );

      assert.equal(status, 0);
      assert.deepEqual(calls[0], {
        command: 'pnpm',
        args: ['install', '--lockfile-only'],
        cwd: join(root, '.nrb/closure'),
      });
      assert.deepEqual(calls[1], {
        command: 'pnpm',
        args: ['install', '--frozen-lockfile'],
        cwd: join(root, '.nrb/closure'),
      });
      assert.ok(lstatSync(join(root, 'node_modules')).isSymbolicLink());
      assert.ok(lstatSync(join(root, 'apps/landing-app/node_modules')).isSymbolicLink());
      assert.equal(existsSync(join(root, 'apps/landing-app/node_modules/stale-marker')), false);
      assert.equal(readClosureLockStatus(root, closure()), 'current');
      for (const file of ['closure.json', 'nrb.config.json', 'workspace.json', 'pnpm-lock.yaml', 'lock.json']) {
        assert.equal(existsSync(join(root, '.nrb/closure', file)), true, file);
      }
      assert.equal(
        readFileSync(join(root, '.nrb/closure/closure.json'), 'utf8'),
        readFileSync(join(root, '.nrb/closure.json'), 'utf8'),
      );
      for (const file of ['closure.json', 'nrb.config.json', 'workspace.json', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'lock.json']) {
        assert.equal(existsSync(join(root, '.nrb/closure', file)), true, file);
      }
      assert.equal(readFileSync(join(root, '.nrb/closure/closure.json'), 'utf8'), readFileSync(join(root, '.nrb/closure.json'), 'utf8'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
