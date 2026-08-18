import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { join, resolve } from 'node:path';

import type { CommandContext } from '../../cli.js';
import {
  effectiveMemoryBytes,
  readCgroupMemoryLimit,
  resolveTestParallelism,
} from '../qa/test-orchestration.js';
import { run, type RunResult } from '../../runtime/process.js';
import {
  closureLockPath,
  parseSelectedClosure,
  type SelectedClosureManifest,
} from '../../setup/closure.js';
import {
  checkClosureArtifacts,
  synchronizeProductClosureBuildContext,
  writeClosureLockMetadata,
} from '../../setup/closure-materializer.js';
import {
  materializeAllReferenceClosure,
  referenceClosureContextPath,
  validateCurrentClosure,
} from '../../setup/closure-workspace.js';
import type { DurableDatabaseProviderId } from '../../setup/catalog.js';

type Execute = (command: string, args: string[], options: { cwd: string; stdio: 'inherit' }) => RunResult;

export interface ClosureRuntime {
  availableParallelism: () => number;
  cgroupMemoryLimit: () => number | undefined;
  totalMemory: () => number;
}

export interface ClosureCommandDependencies {
  buildExpected?: (workspaceRoot: string) => Promise<SelectedClosureManifest>;
  execute?: Execute;
  runtime?: Partial<ClosureRuntime>;
}

export async function runClosureCommand(
  context: CommandContext,
  dependencies: ClosureCommandDependencies = {},
): Promise<number> {
  const [subcommand, ...argv] = context.argv;
  if (subcommand === '--help' || subcommand === '-h' || subcommand === undefined) {
    printUsage();
    return subcommand ? 0 : 1;
  }

  try {
    if (subcommand === 'check') return await checkCommand(context.workspaceRoot, dependencies);
    if (subcommand === 'install') return await installCommand(context.workspaceRoot, dependencies);
    if (subcommand === 'run') return await runTargetCommand(context.workspaceRoot, argv, dependencies);
    if (subcommand === 'materialize') return await materializeCommand(context.workspaceRoot, argv);
    throw new Error(`Unknown closure command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`Closure error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function checkCommand(workspaceRoot: string, dependencies: ClosureCommandDependencies): Promise<number> {
  const { closure, lockStatus } = await requireCurrentClosure(workspaceRoot, dependencies);
  process.stdout.write(
    `Selected closure is current (${closure.projects.length} projects, ${Object.keys(closure.productExternalPackages ?? {}).length} product packages, ${Object.keys(closure.toolingExternalPackages ?? {}).length} tooling packages; lock ${lockStatus}).\n`,
  );
  return 0;
}

async function materializeCommand(workspaceRoot: string, argv: string[]): Promise<number> {
  if (argv[0] !== '--all-reference' || argv[1] !== '--provider' || !['postgres', 'mongodb'].includes(argv[2] ?? '')) {
    throw new Error(
      'Usage: pnpm nrb closure materialize --all-reference --provider <postgres|mongodb>.',
    );
  }
  if (argv.length !== 3) throw new Error(`Unknown materialize argument: ${argv[3]}.`);
  const provider = argv[2] as DurableDatabaseProviderId;
  const closure = await materializeAllReferenceClosure(workspaceRoot, provider);
  process.stdout.write(
    `Materialized ${provider} all-reference context (${closure.projects.length} projects) at ${referenceClosureContextPath(provider)}.\n`,
  );
  return 0;
}

async function installCommand(workspaceRoot: string, dependencies: ClosureCommandDependencies): Promise<number> {
  const { closure } = await requireCurrentClosure(workspaceRoot, dependencies, true);
  const execute = dependencies.execute ?? run;
  const closureRoot = resolve(workspaceRoot, '.nrb/closure');
  const modulesDir = resolve(closureRoot, 'node_modules');
  const workspaceModules = resolve(workspaceRoot, 'node_modules');

  rmSync(modulesDir, { force: true, recursive: true });
  removeWorkspaceDependencyTrees(workspaceRoot);

  const lock = execute('pnpm', ['install', '--lockfile-only'], { cwd: closureRoot, stdio: 'inherit' });
  if (lock.status !== 0) throw new Error(`pnpm lock generation failed with exit code ${lock.status}.`);
  const install = execute('pnpm', ['install', '--frozen-lockfile'], { cwd: closureRoot, stdio: 'inherit' });
  if (install.status !== 0) throw new Error(`pnpm selected install failed with exit code ${install.status}.`);
  if (!existsSync(modulesDir)) throw new Error('pnpm selected install did not create .nrb/closure/node_modules.');
  symlinkSync(modulesDir, workspaceModules, 'junction');
  linkSelectedProjectDependencies(workspaceRoot, closure, modulesDir);
  writeClosureLockMetadata(workspaceRoot, closure);
  synchronizeProductClosureBuildContext(workspaceRoot, closure);
  process.stdout.write(`Installed clean selected pnpm closure at .nrb/closure/node_modules from ${closureLockPath}.\n`);
  return 0;
}

function removeWorkspaceDependencyTrees(workspaceRoot: string): void {
  rmSync(resolve(workspaceRoot, 'node_modules'), { force: true, recursive: true });
  for (const ownershipRoot of ['apps', 'libs', 'packages']) {
    removeNestedDependencyTrees(resolve(workspaceRoot, ownershipRoot));
  }
}

function removeNestedDependencyTrees(path: string): void {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.name === 'node_modules') {
      rmSync(child, { force: true, recursive: true });
    } else if (entry.isDirectory()) {
      removeNestedDependencyTrees(child);
    }
  }
}

function linkSelectedProjectDependencies(
  workspaceRoot: string,
  closure: SelectedClosureManifest,
  modulesDir: string,
): void {
  const selected = new Set(closure.projects);
  const linked = new Set<string>();
  for (const ownershipRoot of ['apps', 'libs', 'packages']) {
    linkProjectDependencyTrees(resolve(workspaceRoot, ownershipRoot), selected, linked, modulesDir);
  }
  const missingRoots = closure.roots.filter((project) => !linked.has(project));
  if (missingRoots.length > 0) {
    throw new Error(`Selected project roots are missing project.json files: ${missingRoots.join(', ')}.`);
  }
}

function linkProjectDependencyTrees(
  path: string,
  selected: ReadonlySet<string>,
  linked: Set<string>,
  modulesDir: string,
): void {
  if (!existsSync(path)) return;
  const projectPath = resolve(path, 'project.json');
  if (existsSync(projectPath)) {
    const project = JSON.parse(readFileSync(projectPath, 'utf8')) as { name?: unknown };
    if (typeof project.name === 'string' && selected.has(project.name)) {
      symlinkSync(modulesDir, resolve(path, 'node_modules'), 'junction');
      linked.add(project.name);
    }
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    linkProjectDependencyTrees(resolve(path, entry.name), selected, linked, modulesDir);
  }
}

async function runTargetCommand(
  workspaceRoot: string,
  argv: string[],
  dependencies: ClosureCommandDependencies,
): Promise<number> {
  const target = argv[0];
  if (!target || target.startsWith('-')) throw new Error('Usage: pnpm nrb closure run <target> [-- <nx-args>].');
  const separator = argv.indexOf('--');
  if (argv.length > 1 && separator !== 1) {
    throw new Error('Additional Nx arguments must follow `--`. Project selection cannot be overridden.');
  }
  const forwarded = separator === 1 ? argv.slice(2) : [];
  if (forwarded.some((argument) => argument === '--all' || argument.startsWith('--projects'))) {
    throw new Error('Selected closure commands do not allow --all or --projects overrides.');
  }

  const { closure } = await requireCurrentClosure(workspaceRoot, dependencies);
  const projects = closure.targets[target];
  if (!projects || projects.length === 0) throw new Error(`Target "${target}" is not available in the selected closure.`);
  const execute = dependencies.execute ?? run;
  const runtime: ClosureRuntime = {
    availableParallelism,
    cgroupMemoryLimit: () => readCgroupMemoryLimit(),
    totalMemory: totalmem,
    ...dependencies.runtime,
  };
  const result = execute(
    'pnpm',
    [
      'exec',
      'nx',
      'run-many',
      '-t',
      target,
      `--projects=${projects.join(',')}`,
      ...resolveClosureConcurrencyArguments(target, forwarded, runtime),
      ...forwarded,
    ],
    { cwd: workspaceRoot, stdio: 'inherit' },
  );
  return result.status;
}

/**
 * `pnpm test`/`lint`/`typecheck` — and therefore the documented `check` and `check:fast`
 * gates — route through here. Without a ceiling they run at Nx's default parallelism with
 * each Vitest project spawning its own unbounded worker pool, which oversubscribes the
 * machine and is what makes timeout-sensitive specs flake locally. The aggregate
 * `test:all` path already derives both limits from CPU and memory; mirror it here.
 *
 * `test`/`component-test` keep deriving their limit from the host-reported memory, while
 * `lint`/`typecheck` use the cgroup-aware effective memory so a container that reports the
 * host's RAM does not spawn more workers than its memory budget allows. An explicitly
 * forwarded `--parallel` always wins.
 */
function resolveClosureConcurrencyArguments(
  target: string,
  forwarded: string[],
  runtime: ClosureRuntime,
): string[] {
  if (forwarded.some((argument) => argument.startsWith('--parallel'))) return [];
  if (target !== 'test' && target !== 'component-test' && target !== 'lint' && target !== 'typecheck') {
    return [];
  }

  const memoryBytes =
    target === 'lint' || target === 'typecheck'
      ? effectiveMemoryBytes({
          totalMemory: runtime.totalMemory,
          cgroupMemoryLimit: runtime.cgroupMemoryLimit,
        })
      : runtime.totalMemory();
  return [`--parallel=${resolveTestParallelism({ cpuCount: runtime.availableParallelism(), memoryBytes })}`];
}

async function requireCurrentClosure(
  workspaceRoot: string,
  dependencies: ClosureCommandDependencies,
  allowStaleLock = false,
): Promise<{ closure: SelectedClosureManifest; lockStatus: 'current' | 'missing' | 'stale' }> {
  const closure = await validateCurrentClosure(workspaceRoot, {
    buildExpected: dependencies.buildExpected,
  });
  const checked = checkClosureArtifacts(workspaceRoot, closure);
  if (!checked.valid) throw new Error(`${checked.problems.join('; ')}; rerun \`pnpm nrb setup\`.`);
  if (checked.lockStatus === 'stale' && !allowStaleLock) {
    throw new Error('.nrb/closure/pnpm-lock.yaml is stale; run `pnpm nrb closure install`.');
  }
  return { closure: parseSelectedClosure(closure), lockStatus: checked.lockStatus };
}

function printUsage(): void {
  process.stdout.write(`Usage: pnpm nrb closure <command>\n\nCommands:\n  check                 Validate generated closure files against the live Nx graph.\n  install               Explicitly generate the selected pnpm lock and install it.\n  run <target> [-- ...] Run an Nx target for its explicit selected projects.\n  materialize --all-reference --provider <postgres|mongodb>\n                        Write a complete maintainer context without product fallback.\n`);
}

export async function runClosureFromContext(context: CommandContext): Promise<number> {
  return runClosureCommand(context);
}
