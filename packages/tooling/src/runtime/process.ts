import { spawnSync } from "node:child_process";
import type { SpawnSyncOptions, StdioOptions } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export interface RunResult {
  command: string;
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  stdio?: StdioOptions;
}

export function commandExists(command: string): boolean {
  const candidates = getCommandCandidates(command);
  return candidates.some((candidate) => isExecutable(candidate));
}

export function run(
  command: string,
  args: string[] = [],
  options: RunOptions = {},
): RunResult {
  const spawnOptions: SpawnSyncOptions = {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe",
  };

  if (spawnOptions.stdio !== "inherit") {
    spawnOptions.encoding = "utf8";
  }

  const result = spawnSync(command, args, spawnOptions);

  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error?.message,
  };
}

function getCommandCandidates(command: string): string[] {
  if (command.includes("/") || command.includes("\\")) {
    return withExecutableExtensions(command);
  }

  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => withExecutableExtensions(join(directory, command)));
}

function withExecutableExtensions(command: string): string[] {
  if (process.platform !== "win32") {
    return [command];
  }

  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);

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
