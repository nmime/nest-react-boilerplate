// @requirements REQ-SCAFFOLD-SELECTION-002
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

function checkTargetsClosure(): SelectedClosureManifest {
  return {
    ...closure(),
    // Target keys stay sorted to match parseSelectedClosure's normalization.
    targets: {
      build: ['landing-app'],
      'component-test': ['landing-app'],
      lint: ['landing-app'],
      serve: ['landing-app'],
      test: ['landing-app'],
      typecheck: ['landing-app'],
    },
  };
}

function rootWithClosure(manifest: SelectedClosureManifest = closure()): string {
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
  synchronizeClosureArtifacts(root, manifest);
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

  it('derives a cgroup-capped --parallel for lint and typecheck and lets a forwarded --parallel win', async () => {
    const manifest = checkTargetsClosure();
    const root = rootWithClosure(manifest);
    const calls: Array<{ command: string; args: string[] }> = [];
    const execute = (command: string, args: string[]) => {
      calls.push({ command, args });
      return { command, args, status: 0, stdout: '', stderr: '' } as never;
    };
    const runtime = {
      availableParallelism: () => 12,
      totalMemory: () => 128 * 1024 ** 3,
      cgroupMemoryLimit: () => 4 * 1024 ** 3,
    };
    const original = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const lintStatus = await runClosureCommand(
        { argv: ['run', 'lint'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
      assert.equal(lintStatus, 0);
      await runClosureCommand(
        { argv: ['run', 'typecheck'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
      await runClosureCommand(
        { argv: ['run', 'lint', '--', '--parallel=3'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
      await runClosureCommand(
        { argv: ['run', 'test'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
      await runClosureCommand(
        { argv: ['run', 'component-test'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
      await runClosureCommand(
        { argv: ['run', 'lint'], packageRoot: '', workspaceRoot: root },
        {
          buildExpected: async () => manifest,
          execute,
          runtime: { ...runtime, cgroupMemoryLimit: () => undefined },
        },
      );
    } finally {
      process.stderr.write = original;
      rmSync(root, { recursive: true, force: true });
    }

    const [lint, typecheck, forwarded, test, componentTest, unlimitedLint] = calls;
    // lint/typecheck: effective memory = min(128 GB host, 4 GB cgroup) = 4 GB,
    // so min(8, 12 cpus, floor(4 GB / 1.5 GB budget)) = 2.
    assert.deepEqual(lint, {
      command: 'pnpm',
      args: ['exec', 'nx', 'run-many', '-t', 'lint', '--projects=landing-app', '--parallel=2'],
    });
    assert.deepEqual(typecheck, {
      command: 'pnpm',
      args: ['exec', 'nx', 'run-many', '-t', 'typecheck', '--projects=landing-app', '--parallel=2'],
    });
    // An explicitly forwarded --parallel always wins.
    assert.deepEqual(forwarded, {
      command: 'pnpm',
      args: ['exec', 'nx', 'run-many', '-t', 'lint', '--projects=landing-app', '--parallel=3'],
    });
    // test/component-test derive from the same effective budget:
    // min(8, 12, floor(4 GB / 1.5 GB)) = 2.
    assert.deepEqual(test, {
      command: 'pnpm',
      args: ['exec', 'nx', 'run-many', '-t', 'test', '--projects=landing-app', '--parallel=2'],
    });
    assert.deepEqual(componentTest, {
      command: 'pnpm',
      args: ['exec', 'nx', 'run-many', '-t', 'component-test', '--projects=landing-app', '--parallel=2'],
    });
    // Without a cgroup limit, lint derives from the full host memory: 8.
    assert.deepEqual(unlimitedLint, {
      command: 'pnpm',
      args: ['exec', 'nx', 'run-many', '-t', 'lint', '--projects=landing-app', '--parallel=8'],
    });
  });

  it('derives the test budget from the cgroup limit and exports the per-worker heap cap to test children', async () => {
    const manifest = checkTargetsClosure();
    const root = rootWithClosure(manifest);
    const calls: Array<{ command: string; args: string[]; options: { cwd: string; env?: NodeJS.ProcessEnv; stdio: string } }> = [];
    const execute = (command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; stdio: string }) => {
      calls.push({ command, args, options });
      return { command, args, status: 0, stdout: '', stderr: '' } as never;
    };
    const runtime = {
      availableParallelism: () => 12,
      totalMemory: () => 128 * 1024 ** 3,
      cgroupMemoryLimit: () => 8 * 1024 ** 3,
    };
    const original = process.stderr.write;
    const originalNodeOptions = process.env.NODE_OPTIONS;
    delete process.env.NODE_OPTIONS;
    process.stderr.write = () => true;
    try {
      await runClosureCommand(
        { argv: ['run', 'test'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
      await runClosureCommand(
        { argv: ['run', 'lint'], packageRoot: '', workspaceRoot: root },
        { buildExpected: async () => manifest, execute, runtime },
      );
    } finally {
      process.stderr.write = original;
      if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = originalNodeOptions;
      rmSync(root, { recursive: true, force: true });
    }

    const [test, lint] = calls;
    // 8 GB budget fits floor(8 GB / 1.5 GB) = 5 per-worker slots.
    assert.deepEqual(test.args.slice(-1), ['--parallel=5']);
    // The heap cap is exported for test children and never for lint children.
    assert.equal(test.options.env?.NODE_OPTIONS, '--max-old-space-size=1536');
    assert.equal(lint.options.env, undefined);
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
