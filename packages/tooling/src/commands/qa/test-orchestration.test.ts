// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { totalmem } from 'node:os';
import { describe, it } from 'node:test';
import type { RunOptions, RunResult } from '../../runtime/process';
import {
  effectiveMemoryBytes,
  perWorkerBudgetBytes,
  readCgroupMemoryLimit,
  resolveTestParallelism,
  resolveTestWorkerLimit,
  runTestOrchestration,
  workerHeapCapMb,
  workerNodeOptions,
} from './test-orchestration';

describe('aggregate test orchestration', () => {
  it('bounds default parallelism by the per-worker budget, CPU, and the deterministic cap', () => {
    // 1.5 GB per-worker budget: 32 GB fits 21 budgets, clamped to 8 workers.
    assert.equal(resolveTestParallelism({ cpuCount: 8, memoryBytes: 32 * 1024 ** 3 }), 8);
    assert.equal(resolveTestParallelism({ cpuCount: 16, memoryBytes: 32 * 1024 ** 3 }), 8);
    assert.equal(resolveTestParallelism({ cpuCount: 1, memoryBytes: 32 * 1024 ** 3 }), 1);
    // A budget smaller than one per-worker slot still gets the minimum of one worker.
    assert.equal(resolveTestParallelism({ cpuCount: 8, memoryBytes: 1024 ** 3 }), 1);
    assert.equal(
      resolveTestWorkerLimit({ cpuCount: 8, memoryBytes: 32 * 1024 ** 3, nxParallel: 2 }),
      4,
    );
    assert.equal(
      resolveTestWorkerLimit({ cpuCount: 2, memoryBytes: 32 * 1024 ** 3, nxParallel: 2 }),
      1,
    );
  });

  it('derives workers from a 4 GB cgroup budget as 2 x 1.5 GB and exports the heap cap to children', () => {
    const calls: Array<{ args: string[]; options: RunOptions }> = [];
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 12,
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (command, args, options): RunResult => {
          calls.push({ args, options });
          return { command: [command, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
        totalMemory: () => 128 * 1024 ** 3,
        cgroupMemoryLimit: () => 4 * 1024 ** 3,
        writeOutput: () => undefined,
      },
    });

    assert.equal(status, 0);
    const first = calls[0];
    assert.ok(first, 'expected the aggregate run to be invoked');
    // floor(4 GiB / 1.5 GiB) = 2 Nx workers; each worker's share (2 GiB) fits
    // one 1.5 GiB test-worker budget, so each target runs a single test worker.
    assert.ok(first.args.includes('--parallel=2'), first.args.join(' '));
    assert.ok(first.args.includes('--maxWorkers=1'), first.args.join(' '));
    assert.equal(first.options.env?.NODE_TEST_CONCURRENCY, '1');
    assert.equal(first.options.env?.NODE_OPTIONS, `--max-old-space-size=${workerHeapCapMb}`);
    assert.equal(workerHeapCapMb, 1536);
    // The 128 GB host figure must not leak into the budget: 8 workers would
    // need 12 GB and OOM the 4 GB container.
    assert.ok(!first.args.includes('--parallel=8'), first.args.join(' '));
  });

  it('scales an unlimited 128 GB host to 8 workers with the total cap within the box', () => {
    const calls: Array<{ args: string[] }> = [];
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 32,
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (command, args): RunResult => {
          calls.push({ args });
          return { command: [command, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
        totalMemory: () => 128 * 1024 ** 3,
        cgroupMemoryLimit: () => undefined,
        writeOutput: () => undefined,
      },
    });

    assert.equal(status, 0);
    const first = calls[0];
    assert.ok(first, 'expected the aggregate run to be invoked');
    assert.ok(first.args.includes('--parallel=8'), first.args.join(' '));
    assert.ok(first.args.includes('--maxWorkers=4'), first.args.join(' '));
    // Worst case: every Nx worker runs its full test-worker fan-out.
    const totalWorstCase = 8 * 4 * perWorkerBudgetBytes;
    assert.ok(totalWorstCase <= 128 * 1024 ** 3, 'total per-worker caps must fit the box');
    // The top-level worker budget alone is 8 x 1.5 GB = 12 GB, under ~16 GB.
    assert.ok(8 * perWorkerBudgetBytes <= 16 * 1024 ** 3);
  });

  it('preserves an existing NODE_OPTIONS when injecting the per-worker heap cap', () => {
    const calls: Array<{ options: RunOptions }> = [];
    runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 4,
        env: { NODE_OPTIONS: '--expose-gc', npm_execpath: '/corepack/pnpm.cjs' },
        run: (command, args, options): RunResult => {
          calls.push({ options });
          return { command: [command, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
        totalMemory: () => 8 * 1024 ** 3,
        cgroupMemoryLimit: () => undefined,
        writeOutput: () => undefined,
      },
    });

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(
        call.options.env?.NODE_OPTIONS,
        `--expose-gc --max-old-space-size=${workerHeapCapMb}`,
      );
    }
  });

  it('builds the worker heap-cap NODE_OPTIONS value', () => {
    assert.equal(workerNodeOptions(undefined), `--max-old-space-size=${workerHeapCapMb}`);
    assert.equal(workerNodeOptions('  '), `--max-old-space-size=${workerHeapCapMb}`);
    assert.equal(
      workerNodeOptions('--expose-gc'),
      `--expose-gc --max-old-space-size=${workerHeapCapMb}`,
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
        cgroupMemoryLimit: () => undefined,
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
          '--parallel=8',
          '--nxBail=false',
          '--excludeTaskDependencies',
          '--outputStyle=static',
          '--',
          '--maxWorkers=1',
          '--coverage',
        ],
        options: {
          cwd: '/workspace',
          env: {
            NODE_OPTIONS: '--max-old-space-size=1536',
            NODE_TEST_CONCURRENCY: '1',
            NX_DAEMON: 'false',
          },
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
          env: {
            NODE_OPTIONS: '--max-old-space-size=1536',
            NODE_TEST_CONCURRENCY: '1',
            NX_DAEMON: 'false',
          },
          stdio: 'inherit',
        },
      },
    ]);
  });

  it('reduces worker counts when the cgroup limit is lower than the host memory', () => {
    const calls: Array<{ args: string[]; options: RunOptions }> = [];
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 8,
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (command, args, options): RunResult => {
          calls.push({ args, options });
          return { command: [command, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
        totalMemory: () => 32 * 1024 ** 3,
        cgroupMemoryLimit: () => 4 * 1024 ** 3,
        writeOutput: () => undefined,
      },
    });

    assert.equal(status, 0);
    const first = calls[0];
    assert.ok(first, 'expected the aggregate run to be invoked');
    // 32 GB host memory would yield 8 Nx workers; the 4 GB cgroup limit caps
    // the budget to floor(4 GiB / 1.5 GiB) = 2 Nx workers, and each worker's
    // 2 GiB share fits exactly one 1.5 GiB test-worker budget (2 concurrent
    // test workers overall, down from 8).
    assert.ok(first.args.includes('--parallel=2'), first.args.join(' '));
    assert.ok(first.args.includes('--maxWorkers=1'), first.args.join(' '));
    assert.equal(first.options.env?.NODE_TEST_CONCURRENCY, '1');
    assert.equal(first.options.env?.NODE_OPTIONS, `--max-old-space-size=${workerHeapCapMb}`);
  });

  it('uses the real cgroup reader when no limit is injected', () => {
    const calls: Array<{ args: string[] }> = [];
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 8,
        env: { npm_execpath: '/corepack/pnpm.cjs' },
        run: (command, args): RunResult => {
          calls.push({ args });
          return { command: [command, ...args].join(' '), status: 0, stdout: '', stderr: '' };
        },
        totalMemory: () => 32 * 1024 ** 3,
        writeOutput: () => undefined,
      },
    });

    assert.equal(status, 0);
    const first = calls[0];
    assert.ok(first, 'expected the aggregate run to be invoked');
    const memoryBytes = effectiveMemoryBytes({ totalMemory: () => 32 * 1024 ** 3 });
    const expectedParallel = resolveTestParallelism({ cpuCount: 8, memoryBytes });
    const expectedWorkers = resolveTestWorkerLimit({ cpuCount: 8, memoryBytes, nxParallel: expectedParallel });
    assert.ok(first.args.includes(`--parallel=${expectedParallel}`), first.args.join(' '));
    assert.ok(first.args.includes(`--maxWorkers=${expectedWorkers}`), first.args.join(' '));
  });

  it('honours an explicit limit and propagates Nx failures without masking them', () => {
    const status = runTestOrchestration({
      workspaceRoot: '/workspace',
      runtime: {
        availableParallelism: () => 8,
        env: { NX_PARALLEL: '1', npm_execpath: '/corepack/pnpm.cjs' },
        run: (): RunResult => ({ command: 'nx', status: 23, stdout: '', stderr: '' }),
        totalMemory: () => 32 * 1024 ** 3,
        cgroupMemoryLimit: () => undefined,
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
        cgroupMemoryLimit: () => undefined,
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
        cgroupMemoryLimit: () => undefined,
        writeError: (message) => errors.push(message),
      },
    });

    assert.equal(status, 2);
    assert.equal(called, false);
    assert.match(errors[0] ?? '', /positive integer/u);
  });
});

describe('cgroup-aware effective memory', () => {
  const v2Path = '/sys/fs/cgroup/memory.max';
  const v1Path = '/sys/fs/cgroup/memory/memory.limit_in_bytes';

  function readerFor(files: Record<string, string>): (path: string) => string {
    return (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: no such file: ${path}`);
      return content;
    };
  }

  it('parses a cgroup v2 limit and treats "max" as unlimited', () => {
    assert.equal(readCgroupMemoryLimit(readerFor({ [v2Path]: 'max\n' })), undefined);
    assert.equal(readCgroupMemoryLimit(readerFor({ [v2Path]: '4294967296\n' })), 4294967296);
    // The v2 file wins even when a v1 file would also match.
    assert.equal(
      readCgroupMemoryLimit(readerFor({ [v2Path]: '2147483648', [v1Path]: '4294967296' })),
      2147483648,
    );
  });

  it('falls back to the cgroup v1 file and treats sentinel values as unlimited', () => {
    assert.equal(readCgroupMemoryLimit(readerFor({})), undefined);
    assert.equal(readCgroupMemoryLimit(readerFor({ [v1Path]: '9223372036854771712\n' })), undefined);
    assert.equal(readCgroupMemoryLimit(readerFor({ [v1Path]: '4294967296\n' })), 4294967296);
  });

  it('treats malformed or non-positive limits as unlimited', () => {
    assert.equal(readCgroupMemoryLimit(readerFor({ [v2Path]: 'garbage\n' })), undefined);
    assert.equal(readCgroupMemoryLimit(readerFor({ [v2Path]: '0' })), undefined);
    assert.equal(readCgroupMemoryLimit(readerFor({ [v1Path]: 'garbage\n' })), undefined);
    assert.equal(readCgroupMemoryLimit(readerFor({ [v1Path]: '0' })), undefined);
  });

  it('caps effective memory at the cgroup limit and passes the host value through when unlimited', () => {
    assert.equal(
      effectiveMemoryBytes({ totalMemory: () => 32 * 1024 ** 3, cgroupMemoryLimit: () => 4 * 1024 ** 3 }),
      4 * 1024 ** 3,
    );
    assert.equal(
      effectiveMemoryBytes({ totalMemory: () => 2 * 1024 ** 3, cgroupMemoryLimit: () => 4 * 1024 ** 3 }),
      2 * 1024 ** 3,
    );
    assert.equal(
      effectiveMemoryBytes({ totalMemory: () => 32 * 1024 ** 3, cgroupMemoryLimit: () => undefined }),
      32 * 1024 ** 3,
    );
  });

  it('falls back to the OS readers when no seam values are injected', () => {
    assert.equal(
      effectiveMemoryBytes({ cgroupMemoryLimit: () => 4 * 1024 ** 3 }),
      Math.min(totalmem(), 4 * 1024 ** 3),
    );
    assert.equal(
      effectiveMemoryBytes({ totalMemory: () => 8 * 1024 ** 3 }),
      Math.min(8 * 1024 ** 3, readCgroupMemoryLimit() ?? Number.POSITIVE_INFINITY),
    );
    assert.equal(
      effectiveMemoryBytes(),
      Math.min(totalmem(), readCgroupMemoryLimit() ?? Number.POSITIVE_INFINITY),
    );
  });
});
