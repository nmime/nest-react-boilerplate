// Evidence for: REQ-ASSURANCE-TRACE-001
import { existsSync } from "node:fs";
// Mutation evidence for REQ-ASSURANCE-TRACE-001.
import { resolve } from "node:path";
import { parseArgs } from "../../runtime/args";
import { writeJson } from "../../runtime/files";
import {
  commandExists,
  run,
  type RunOptions,
  type RunResult,
} from "../../runtime/process";

export interface MutationOptions {
  argv?: string[];
  workspaceRoot?: string;
  runtime?: {
    commandExists(program: string): boolean;
    run(program: string, args: string[], options: RunOptions): RunResult;
  };
}

export function runMutation(options: MutationOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const runtime = options.runtime ?? { commandExists, run };
  const args = parseArgs(options.argv ?? []);
  const config =
    args.options.get("config") ??
    process.env.STRYKER_CONFIG ??
    "stryker.config.mjs";
  const reportPath =
    args.options.get("report") ?? "test-results/mutation/command.json";
  const mutate = args.options.get("mutate") ?? process.env.STRYKER_MUTATE;
  const strykerCli =
    "packages/tooling/node_modules/@stryker-mutator/core/bin/stryker.js";
  const command = [
    strykerCli,
    "run",
    config,
    ...(mutate ? ["--mutate", mutate] : []),
    ...args.positional,
  ];
  const configPath = resolve(workspaceRoot, config);
  const reportAbsolutePath = resolve(workspaceRoot, reportPath);

  if (!existsSync(configPath)) {
    console.error(`Stryker config not found: ${config}`);
    return 1;
  }

  if (args.flags.has("dry-run")) {
    const report = { status: "dry-run", command: ["node", ...command], config };
    writeJson(reportAbsolutePath, report);
    console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
    return 0;
  }

  if (!runtime.commandExists("node")) {
    console.error("Node.js is required to run the repository-pinned Stryker.");
    return 1;
  }

  writeJson(reportAbsolutePath, {
    status: "running",
    command: ["node", ...command],
    config,
  });
  const result = runtime.run("node", command, {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
  writeJson(reportAbsolutePath, {
    status: result.status === 0 ? "ok" : "failed",
    command: ["node", ...command],
    config,
    exitCode: result.status,
  });

  return result.status;
}
