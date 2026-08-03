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
import { mutateExclusions, runMutation } from './mutation';

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
  it('runs Stryker for an explicit workspace-wide scope', () => {
    const workspaceRoot = workspace();
    const calls: Array<{
      program: string;
      args: string[];
      options: RunOptions;
    }> = [];

    const status = runMutation({
      workspaceRoot,
      argv: ['--all'],
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

  it('refuses to run unscoped, because a workspace-wide default cannot finish', () => {
    const workspaceRoot = workspace();
    let executed = false;

    const status = runMutation({
      workspaceRoot,
      runtime: {
        commandExists: () => true,
        run: (): RunResult => {
          executed = true;
          return { command: 'not executed', status: 0, stdout: '', stderr: '' };
        },
      },
    });

    assert.equal(status, 1);
    assert.equal(executed, false);
  });

  it('derives the mutate glob and per-project test command from the Nx graph', () => {
    const workspaceRoot = workspace();
    delete process.env.STRYKER_TEST_COMMAND;
    const calls: string[][] = [];

    const status = runMutation({
      workspaceRoot,
      argv: ['--project', '@app/frontend-runtime'],
      runtime: {
        commandExists: () => true,
        run: (_program, args): RunResult => {
          calls.push(args);
          if (args.includes('show')) {
            return {
              command: 'nx show project',
              status: 0,
              stdout: JSON.stringify({
                root: 'libs/frontend/runtime/lib',
                sourceRoot: 'libs/frontend/runtime/lib/src',
                targets: { test: {}, lint: {} },
              }),
              stderr: '',
            };
          }
          return { command: 'stryker', status: 0, stdout: '', stderr: '' };
        },
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(calls[1]?.slice(-2), [
      '--mutate',
      ['libs/frontend/runtime/lib/src/**/*.ts', 'libs/frontend/runtime/lib/src/**/*.tsx', ...mutateExclusions].join(
        ',',
      ),
    ]);
    assert.equal(
      process.env.STRYKER_TEST_COMMAND,
      'pnpm exec nx run @app/frontend-runtime:test --skip-nx-cache',
    );
    delete process.env.STRYKER_TEST_COMMAND;
  });

  it('selects tagged projects generically and keeps a tag dry run non-executing', () => {
    const workspaceRoot = workspace();
    const projectsShown: string[] = [];
    let strykerRuns = 0;

    const status = runMutation({
      workspaceRoot,
      argv: ['--tag', 'type:common', '--max-projects', '2', '--dry-run'],
      runtime: {
        commandExists: () => true,
        run: (_program, args): RunResult => {
          if (args.includes('projects')) {
            return {
              command: 'nx show projects',
              status: 0,
              stdout: JSON.stringify(['@app/c-third', '@app/a-first', '@app/b-second']),
              stderr: '',
            };
          }
          if (args.includes('project')) {
            const name = args[args.indexOf('project') + 1] ?? '';
            projectsShown.push(name);
            return {
              command: 'nx show project',
              status: 0,
              stdout: JSON.stringify({
                root: `libs/${name}`,
                sourceRoot: `libs/${name}/src`,
                targets: { test: {} },
              }),
              stderr: '',
            };
          }
          strykerRuns += 1;
          return { command: 'stryker', status: 0, stdout: '', stderr: '' };
        },
      },
    });

    assert.equal(status, 0);
    // Bounded and deterministic: sorted, then capped at --max-projects.
    assert.deepEqual(projectsShown, ['@app/a-first', '@app/b-second']);
    assert.equal(strykerRuns, 0);
  });

  it('fails when a tag matches no project with a test target', () => {
    const workspaceRoot = workspace();

    const status = runMutation({
      workspaceRoot,
      argv: ['--tag', 'type:nonexistent'],
      runtime: {
        commandExists: () => true,
        run: (): RunResult => ({
          command: 'nx show projects',
          status: 0,
          stdout: '[]',
          stderr: '',
        }),
      },
    });

    assert.equal(status, 1);
  });

  it('restates the config exclusions, because Stryker replaces the mutate array instead of merging it', () => {
    // Read the real config so the two cannot drift apart silently.
    const configSource = readFileSync(
      new URL('../../../../../stryker.config.mjs', import.meta.url),
      'utf8',
    );
    const configExclusions = [...configSource.matchAll(/"(![^"]+)"/gu)].map((match) => match[1]);
    assert.ok(configExclusions.length > 0, 'stryker.config.mjs should declare negative mutate patterns');
    for (const exclusion of configExclusions) {
      assert.ok(
        mutateExclusions.includes(exclusion as (typeof mutateExclusions)[number]),
        `mutateExclusions is missing ${exclusion}, so a scoped run would mutate files the config excludes`,
      );
    }

    const workspaceRoot = workspace();
    const calls: string[][] = [];
    runMutation({
      workspaceRoot,
      argv: ['--project', '@app/common-authz'],
      runtime: {
        commandExists: () => true,
        run: (_program, args): RunResult => {
          calls.push(args);
          if (args.includes('show')) {
            return {
              command: 'nx show project',
              status: 0,
              stdout: JSON.stringify({
                root: 'libs/common/authz/lib',
                sourceRoot: 'libs/common/authz/lib/src',
                targets: { test: {} },
              }),
              stderr: '',
            };
          }
          return { command: 'stryker', status: 0, stdout: '', stderr: '' };
        },
      },
    });

    const mutateValue = calls[1]?.[calls[1].indexOf('--mutate') + 1] ?? '';
    for (const exclusion of configExclusions) {
      assert.ok(mutateValue.includes(exclusion), `--mutate should carry ${exclusion}`);
    }
  });

  it('does not recurse forever when the tag comes from the environment', () => {
    const workspaceRoot = workspace();
    process.env.STRYKER_TAG = 'type:common';
    let strykerRuns = 0;

    try {
      const status = runMutation({
        workspaceRoot,
        argv: ['--max-projects', '1'],
        runtime: {
          commandExists: () => true,
          run: (_program, args): RunResult => {
            if (args.includes('projects')) {
              return { command: 'nx', status: 0, stdout: JSON.stringify(['@app/only']), stderr: '' };
            }
            if (args.includes('project')) {
              return {
                command: 'nx',
                status: 0,
                stdout: JSON.stringify({
                  root: 'libs/only',
                  sourceRoot: 'libs/only/src',
                  targets: { test: {} },
                }),
                stderr: '',
              };
            }
            strykerRuns += 1;
            return { command: 'stryker', status: 0, stdout: '', stderr: '' };
          },
        },
      });

      assert.equal(status, 0);
      // Exactly one real mutation run, not an unbounded re-entry.
      assert.equal(strykerRuns, 1);
    } finally {
      delete process.env.STRYKER_TAG;
      delete process.env.STRYKER_TEST_COMMAND;
    }
  });

  it('rejects a project with no test target to measure mutants against', () => {
    const workspaceRoot = workspace();
    let strykerRuns = 0;

    const status = runMutation({
      workspaceRoot,
      argv: ['--project', 'landing-i18n'],
      runtime: {
        commandExists: () => true,
        run: (_program, args): RunResult => {
          if (args.includes('show')) {
            return {
              command: 'nx show project',
              status: 0,
              stdout: JSON.stringify({
                root: 'libs/frontend/feature/landing/i18n/lib',
                sourceRoot: 'libs/frontend/feature/landing/i18n/lib/src',
                targets: { lint: {} },
              }),
              stderr: '',
            };
          }
          strykerRuns += 1;
          return { command: 'stryker', status: 0, stdout: '', stderr: '' };
        },
      },
    });

    assert.equal(status, 1);
    assert.equal(strykerRuns, 0);
  });

  it('reports an unreadable Nx project definition instead of mutating nothing', () => {
    const workspaceRoot = workspace();

    const status = runMutation({
      workspaceRoot,
      argv: ['--project', 'broken'],
      runtime: {
        commandExists: () => true,
        run: (): RunResult => ({
          command: 'nx show project',
          status: 0,
          stdout: 'not json',
          stderr: '',
        }),
      },
    });

    assert.equal(status, 1);
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
