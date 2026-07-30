// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RunOptions, RunResult } from '../../runtime/process';
import {
  resolveTestParallelism,
  resolveTestWorkerLimit,
  runTestOrchestration,
} from './test-orchestration';

describe('aggregate test orchestration', () => {
  it('bounds default parallelism by CPU, memory, and the deterministic worker cap', () => {
    assert.equal(resolveTestParallelism({ cpuCount: 8, memoryBytes: 32 * 1024 ** 3 }), 2);
    assert.equal(resolveTestParallelism({ cpuCount: 1, memoryBytes: 32 * 1024 ** 3 }), 1);
    assert.equal(resolveTestParallelism({ cpuCount: 8, memoryBytes: 1024 ** 3 }), 1);
    assert.equal(
      resolveTestWorkerLimit({ cpuCount: 8, memoryBytes: 32 * 1024 ** 3, nxParallel: 2 }),
      2,
    );
    assert.equal(
      resolveTestWorkerLimit({ cpuCount: 2, memoryBytes: 32 * 1024 ** 3, nxParallel: 2 }),
      1,
    );
  });

  it('runs every Nx test target with unchanged coverage and explicit resource limits', () => {
    const calls: Array<{ command: string; args: string[]; options: RunOptions }> = [];
    const status = runTestOrchestration({
      argv: ['--coverage'],
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 8,
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (command, args, options): RunResult => {
          calls.push({ command, args, options });
          return { command: [command, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
        totalMemory: () => 32 * 1024 ** 3,
        writeOutput: () => undefined,
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(calls, [
      {
        command: process.execPath,
        args: [
          '/corepack/pnpm.cjs',
          'exec',
          'nx',
          'run-many',
          '-t',
          'test',
          '--all',
          '--exclude=@app/backend-common-nats',
          '--parallel=2',
          '--nxBail=false',
          '--excludeTaskDependencies',
          '--outputStyle=static',
          '--',
          '--maxWorkers=2',
          '--coverage',
        ],
        options: {
          cwd: '/workspace',
          env: { NODE_TEST_CONCURRENCY: '2', NX_DAEMON: 'false' },
          stdio: 'inherit',
        },
      },
      {
        command: process.execPath,
        args: [
          '/corepack/pnpm.cjs',
          'exec',
          'nx',
          'run',
          '@app/backend-common-nats:test',
          '--outputStyle=static',
          '--',
          '--coverage',
        ],
        options: {
          cwd: '/workspace',
          env: { NODE_TEST_CONCURRENCY: '2', NX_DAEMON: 'false' },
          stdio: 'inherit',
        },
      },
    ]);
  });

  it('honours an explicit limit and propagates Nx failures without masking them', () => {
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 8,
        env: { NX_PARALLEL: '1', npm_execpath: '/corepack/pnpm.cjs' },
        run: (): RunResult => ({ command: 'nx', status: 23, stdout: '', stderr: '' }),
        totalMemory: () => 32 * 1024 ** 3,
        writeOutput: () => undefined,
      },
    });

    assert.equal(status, 23);
  });

  it('runs the isolated target after the main aggregate and propagates its failure', () => {
    let calls = 0;
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 2,
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (): RunResult => {
          calls += 1;
          return { command: 'nx', status: calls === 1 ? 0 : 17, stdout: '', stderr: '' };
        },
        totalMemory: () => 8 * 1024 ** 3,
        writeOutput: () => undefined,
      },
    });

    assert.equal(calls, 2);
    assert.equal(status, 17);
  });

  it('rejects invalid parallelism before starting Nx', () => {
    let called = false;
    const errors: string[] = [];
    const status = runTestOrchestration({
      argv: ['--parallel=0'],
      workspaceRoot: '/workspace',
      runtime: {
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (): RunResult => {
          called = true;
          return { command: 'nx', status: 0, stdout: '', stderr: '' };
        },
        writeError: (message) => errors.push(message),
      },
    });

    assert.equal(status, 2);
    assert.equal(called, false);
    assert.match(errors[0] ?? '', /positive integer/u);
  });
});
