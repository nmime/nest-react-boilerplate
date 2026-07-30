import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions, StdioOptions } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export interface RunResult {
  command: string;
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
  signal?: NodeJS.Signals;
  timedOut?: boolean;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  stdio?: StdioOptions;
  timeoutMs?: number;
}

export interface CommandInvocation {
  command: string;
  args: string[];
}

export interface PackageManagerInvocationOptions {
  env?: NodeJS.ProcessEnv;
  nodeExecutable?: string;
  platform?: NodeJS.Platform;
}

export function commandExists(command: string): boolean {
  const candidates = getCommandCandidates(command);
  return candidates.some((candidate) => isExecutable(candidate));
}

export function run(command: string, args: string[] = [], options: RunOptions = {}): RunResult {
  const spawnOptions: SpawnSyncOptions = {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    shell: options.shell ?? false,
    stdio: options.stdio ?? 'pipe',
    timeout: options.timeoutMs,
  };

  if (spawnOptions.stdio !== 'inherit') {
    spawnOptions.encoding = 'utf8';
  }

  const result = spawnSync(command, args, spawnOptions);
  const timedOut = result.error !== undefined && 'code' in result.error && result.error.code === 'ETIMEDOUT';

  return {
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    error: result.error?.message,
    signal: result.signal ?? undefined,
    timedOut,
  };
}

export function packageManagerInvocation(
  args: string[],
  options: PackageManagerInvocationOptions = {},
): CommandInvocation {
  const env = options.env ?? process.env;
  const packageManagerPath = env.npm_execpath?.trim();
  if (packageManagerPath) {
    return {
      command: options.nodeExecutable ?? process.execPath,
      args: [packageManagerPath, ...args],
    };
  }

  if ((options.platform ?? process.platform) === 'win32') {
    throw new Error(
      'Cannot locate the active pnpm/Corepack executable on Windows; invoke repository tooling through pnpm.',
    );
  }

  return { command: 'pnpm', args };
}

function getCommandCandidates(command: string): string[] {
  if (command.includes('/') || command.includes('\\')) {
    return withExecutableExtensions(command);
  }

  return (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => withExecutableExtensions(join(directory, command)));
}

function withExecutableExtensions(command: string): string[] {
  if (process.platform !== 'win32') {
    return [command];
  }

  const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);

  if (extensions.some((extension) => command.endsWith(extension))) {
    return [command];
  }

  return extensions.map((extension) => `${command}${extension}`);
}

function isExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
