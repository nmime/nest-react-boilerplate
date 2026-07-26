// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { RunOptions, RunResult } from '../../runtime/process';
import { runMutation } from './mutation';

// Regression evidence that REQ-ASSURANCE-TRACE-001 mutation execution is
// default-on while explicit dry-run remains non-executing.
const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { force: true, recursive: true });
  }
});

function workspace(): string {
  const path = mkdtempSync(join(tmpdir(), 'nrb-mutation-'));
  workspaces.push(path);
  writeFileSync(join(path, 'stryker.config.mjs'), 'export default {};');
  return path;
}

describe('runMutation', () => {
  it('runs Stryker by default without an opt-in environment flag', () => {
    const workspaceRoot = workspace();
    const calls: Array<{
      program: string;
      args: string[];
      options: RunOptions;
    }> = [];

    const status = runMutation({
      workspaceRoot,
      runtime: {
        commandExists: () => true,
        run: (program, args, options): RunResult => {
          calls.push({ program, args, options });
          return { command: [program, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
      },
    });

    assert.equal(status, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.program, 'node');
    assert.deepEqual(calls[0]?.args, [
      'packages/tooling/node_modules/@stryker-mutator/core/bin/stryker.js',
      'run',
      'stryker.config.mjs',
    ]);
    assert.equal(calls[0]?.options.cwd, workspaceRoot);
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(workspaceRoot, 'test-results/mutation/command.json'),
          'utf8',
        ),
      ),
      {
        status: 'ok',
        command: [
          'node',
          'packages/tooling/node_modules/@stryker-mutator/core/bin/stryker.js',
          'run',
          'stryker.config.mjs',
        ],
        config: 'stryker.config.mjs',
        exitCode: 0,
      },
    );
  });

  it('keeps an explicit dry run non-executing and machine-readable', () => {
    const workspaceRoot = workspace();
    let executed = false;

    const status = runMutation({
      workspaceRoot,
      argv: ['--dry-run'],
      runtime: {
        commandExists: () => true,
        run: (): RunResult => {
          executed = true;
          return { command: 'not executed', status: 0, stdout: '', stderr: '' };
        },
      },
    });

    assert.equal(status, 0);
    assert.equal(executed, false);
    assert.equal(
      JSON.parse(
        readFileSync(
          join(workspaceRoot, 'test-results/mutation/command.json'),
          'utf8',
        ),
      ).status,
      'dry-run',
    );
  });

  it('forwards an explicit mutation scope to Stryker', () => {
    const workspaceRoot = workspace();
    const calls: string[][] = [];

    const status = runMutation({
      workspaceRoot,
      argv: ['--mutate', 'src/domain.ts'],
      runtime: {
        commandExists: () => true,
        run: (_program, args): RunResult => {
          calls.push(args);
          return {
            command: ['pnpm', ...args].join(' '),
            status: 0,
            stdout: '',
            stderr: '',
          };
        },
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(calls[0]?.slice(-2), ['--mutate', 'src/domain.ts']);
  });
});
