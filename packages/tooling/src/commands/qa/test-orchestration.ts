import { availableParallelism, totalmem } from 'node:os';
import type { RunOptions, RunResult } from '../../runtime/process';
import { packageManagerInvocation, run } from '../../runtime/process';

const bytesPerWorker = 2 * 1024 * 1024 * 1024;
// The hard cap only guards CI runners that lie about their limits; hardware
// never permits more than its CPU/memory budget, so the CPU/memory heuristics
// below must not be clamped to a fixed small number on every machine.
const defaultMaxWorkers = 8;
const bytesPerTestWorker = 1024 * 1024 * 1024;
const defaultMaxTestWorkers = 4;

interface TestOrchestrationRuntime {
  availableParallelism: () => number;
  env: NodeJS.ProcessEnv;
  run: (command: string, args: string[], options: RunOptions) => RunResult;
  totalMemory: () => number;
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
  const memoryWorkers = Math.max(1, Math.floor(options.memoryBytes / bytesPerWorker));
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
    Math.floor(options.memoryBytes / options.nxParallel / bytesPerTestWorker),
  );
  return Math.min(defaultMaxTestWorkers, cpuWorkers, memoryWorkers);
}

export function runTestOrchestration(options: TestOrchestrationOptions): number {
  const runtime: TestOrchestrationRuntime = {
    availableParallelism,
    env: process.env,
    run,
    totalMemory: totalmem,
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
    const memoryBytes = runtime.totalMemory();
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
