import { readFileSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import type { RunOptions, RunResult } from '../../runtime/process';
import { packageManagerInvocation, run } from '../../runtime/process';

// The orchestration models memory as a budget, not a fixed worker count: the
// effective budget B (host RAM capped by the cgroup limit) is divided into
// per-worker slots of this size, so a 4 GB container derives 2 workers while a
// 128 GB host derives the capped 8 — each worker's worst case is bounded
// instead of each machine guessing.
export const perWorkerBudgetBytes = 1536 * 1024 * 1024;
// The hard cap only guards CI runners that lie about their limits; hardware
// never permits more than its CPU/memory budget, so the CPU/memory heuristics
// below must not be clamped to a fixed small number on every machine.
const defaultMaxWorkers = 8;
const defaultMaxTestWorkers = 4;
// Each test child (one per Vitest worker under the forks pool) gets this
// `--max-old-space-size` cap so a single misbehaving project cannot grow past
// its budgeted slot even when the container's cgroup would let it.
export const workerHeapCapMb = perWorkerBudgetBytes / (1024 * 1024);

/**
 * Builds the `NODE_OPTIONS` value exported into test child environments: the
 * per-worker old-space cap appended to any existing value, so an inherited
 * `NODE_OPTIONS` (e.g. `--expose-gc`) is preserved instead of overwritten.
 */
export function workerNodeOptions(existing?: string): string {
  const cap = `--max-old-space-size=${workerHeapCapMb}`;
  const base = (existing ?? '').trim();
  return base ? `${base} ${cap}` : cap;
}
const cgroupV2MemoryMaxPath = '/sys/fs/cgroup/memory.max';
const cgroupV1MemoryLimitPath = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
// cgroup v1 reports a page-counter-sized value (~2^63) when no limit is set;
// anything at or above 2^62 is treated as "unlimited" per the v1 kernel docs.
const cgroupUnlimitedThreshold = 2 ** 62;

/**
 * Reads the memory limit enforced on this process by its cgroup, in bytes.
 *
 * `os.totalmem()` reports the host's RAM even inside a container, so worker
 * counts derived from it can far outstrip the container's real budget and get
 * OOM-killed. Returns `undefined` when no limit applies: the v2 "max" value, a
 * v1 sentinel, or missing cgroup files (bare-host or unmanaged environments).
 */
export function readCgroupMemoryLimit(
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): number | undefined {
  const read = (path: string): string | undefined => {
    try {
      return readText(path);
    } catch {
      return undefined;
    }
  };

  const v2 = read(cgroupV2MemoryMaxPath)?.trim();
  if (v2 !== undefined) {
    if (v2 === 'max') return undefined;
    const limit = Number.parseInt(v2, 10);
    return Number.isFinite(limit) && limit > 0 ? limit : undefined;
  }

  const v1 = read(cgroupV1MemoryLimitPath)?.trim();
  if (v1 === undefined) return undefined;
  const limit = Number.parseInt(v1, 10);
  if (!Number.isFinite(limit) || limit <= 0) return undefined;
  return limit >= cgroupUnlimitedThreshold ? undefined : limit;
}

/**
 * Memory actually available to this process: the lower of what the OS reports
 * and what the container's cgroup permits.
 */
export function effectiveMemoryBytes(options: {
  totalMemory?: () => number;
  cgroupMemoryLimit?: () => number | undefined;
} = {}): number {
  const totalMemory = options.totalMemory ?? totalmem;
  const cgroupMemoryLimit = options.cgroupMemoryLimit ?? readCgroupMemoryLimit;
  return Math.min(totalMemory(), cgroupMemoryLimit() ?? Number.POSITIVE_INFINITY);
}

interface TestOrchestrationRuntime {
  availableParallelism: () => number;
  env: NodeJS.ProcessEnv;
  run: (command: string, args: string[], options: RunOptions) => RunResult;
  totalMemory: () => number;
  cgroupMemoryLimit: () => number | undefined;
  writeError: (message: string) => void;
  writeOutput: (message: string) => void;
}

export interface TestOrchestrationOptions {
  argv?: string[];
  runtime?: Partial<TestOrchestrationRuntime>;
  workspaceRoot: string;
}

interface ParsedTestOptions {
  coverage: boolean;
  parallel?: string;
}

function parseTestOptions(argv: string[]): ParsedTestOptions {
  let coverage = false;
  let parallel: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--coverage') {
      coverage = true;
      continue;
    }
    if (value === '--parallel') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Aggregate test option --parallel requires a positive integer.');
      }
      parallel = next;
      index += 1;
      continue;
    }
    if (value.startsWith('--parallel=')) {
      parallel = value.slice('--parallel='.length);
      continue;
    }
    throw new Error(`Unknown aggregate test option: ${value}`);
  }

  return { coverage, parallel };
}

export function resolveTestParallelism(options: {
  cpuCount: number;
  memoryBytes: number;
  requested?: string;
}): number {
  if (options.requested !== undefined) {
    if (!/^[1-9]\d*$/.test(options.requested)) {
      throw new Error(`Test parallelism must be a positive integer, received: ${options.requested}`);
    }
    return Number.parseInt(options.requested, 10);
  }

  const cpuWorkers = Math.max(1, Math.floor(options.cpuCount));
  const memoryWorkers = Math.max(1, Math.floor(options.memoryBytes / perWorkerBudgetBytes));
  return Math.min(defaultMaxWorkers, cpuWorkers, memoryWorkers);
}

export function resolveTestWorkerLimit(options: {
  cpuCount: number;
  memoryBytes: number;
  nxParallel: number;
  requested?: string;
}): number {
  if (options.requested !== undefined) {
    if (!/^[1-9]\d*$/.test(options.requested)) {
      throw new Error(`Vitest worker limit must be a positive integer, received: ${options.requested}`);
    }
    return Number.parseInt(options.requested, 10);
  }

  const cpuWorkers = Math.max(1, Math.floor(options.cpuCount / options.nxParallel));
  const memoryWorkers = Math.max(
    1,
    Math.floor(options.memoryBytes / options.nxParallel / perWorkerBudgetBytes),
  );
  return Math.min(defaultMaxTestWorkers, cpuWorkers, memoryWorkers);
}

export function runTestOrchestration(options: TestOrchestrationOptions): number {
  const runtime: TestOrchestrationRuntime = {
    availableParallelism,
    env: process.env,
    run,
    totalMemory: totalmem,
    cgroupMemoryLimit: () => readCgroupMemoryLimit(),
    writeError: (message) => process.stderr.write(`${message}\n`),
    writeOutput: (message) => process.stdout.write(`${message}\n`),
    ...options.runtime,
  };

  let parsed: ParsedTestOptions;
  let parallel: number;
  let testWorkers: number;
  try {
    parsed = parseTestOptions(options.argv ?? []);
    const cpuCount = runtime.availableParallelism();
    const memoryBytes = effectiveMemoryBytes({
      totalMemory: runtime.totalMemory,
      cgroupMemoryLimit: runtime.cgroupMemoryLimit,
    });
    parallel = resolveTestParallelism({
      cpuCount,
      memoryBytes,
      requested: parsed.parallel ?? runtime.env.NX_PARALLEL,
    });
    testWorkers = resolveTestWorkerLimit({
      cpuCount,
      memoryBytes,
      nxParallel: parallel,
      requested: runtime.env.VITEST_MAX_WORKERS,
    });
  } catch (error) {
    runtime.writeError(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const nxArgs = [
    'exec',
    'nx',
    'run-many',
    '-t',
    'test',
    '--all',
    '--exclude=@app/backend-common-nats',
    `--parallel=${parallel}`,
    '--nxBail=false',
    '--excludeTaskDependencies',
    '--outputStyle=static',
    '--',
    `--maxWorkers=${testWorkers}`,
  ];
  if (parsed.coverage) nxArgs.push('--coverage');

  runtime.writeOutput(
    `Running aggregate ${parsed.coverage ? 'coverage' : 'unit'} tests with ${parallel} Nx worker(s) and ${testWorkers} test worker(s) per target.`,
  );
  const runOptions: RunOptions = {
    cwd: options.workspaceRoot,
    env: {
      // Enforces the per-worker heap cap in every spawned test process; the
      // Vitest workers are separate (forks pool) processes, so this caps each
      // one even if a project's test load is pathologically memory-hungry.
      NODE_OPTIONS: workerNodeOptions(runtime.env.NODE_OPTIONS),
      NODE_TEST_CONCURRENCY: String(testWorkers),
      NX_DAEMON: runtime.env.NX_DAEMON ?? 'false',
    },
    stdio: 'inherit',
  };
  let packageManager;
  try {
    packageManager = packageManagerInvocation(nxArgs, { env: runtime.env });
  } catch (error) {
    runtime.writeError(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const result = runtime.run(packageManager.command, packageManager.args, runOptions);
  if (result.error) runtime.writeError(`Unable to start Nx aggregate tests: ${result.error}`);

  // This target already pins its Vitest worker count, so forwarding a second
  // --maxWorkers value would make Vitest reject the command.
  const natsArgs = [
    'exec',
    'nx',
    'run',
    '@app/backend-common-nats:test',
    '--outputStyle=static',
  ];
  if (parsed.coverage) natsArgs.push('--', '--coverage');
  const natsPackageManager = packageManagerInvocation(natsArgs, { env: runtime.env });
  const natsResult = runtime.run(natsPackageManager.command, natsPackageManager.args, runOptions);
  if (natsResult.error) runtime.writeError(`Unable to start the NATS test target: ${natsResult.error}`);

  return result.status !== 0 ? result.status : natsResult.status;
}
