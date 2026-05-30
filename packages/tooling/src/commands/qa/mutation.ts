import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "../../runtime/args";
import { writeJson } from "../../runtime/files";
import { commandExists, run } from "../../runtime/process";

export interface MutationOptions {
  argv?: string[];
  workspaceRoot?: string;
}

export function runMutation(options: MutationOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const args = parseArgs(options.argv ?? []);
  const config =
    args.options.get("config") ??
    process.env.STRYKER_CONFIG ??
    "stryker.config.mjs";
  const reportPath =
    args.options.get("report") ?? "test-results/mutation/command.json";
  const command = [
    "dlx",
    "@stryker-mutator/core@latest",
    "run",
    config,
    ...args.positional,
  ];
  const configPath = resolve(workspaceRoot, config);
  const reportAbsolutePath = resolve(workspaceRoot, reportPath);

  if (!existsSync(configPath)) {
    console.error(`Stryker config not found: ${config}`);
    return 1;
  }

  if (args.flags.has("dry-run")) {
    const report = { status: "dry-run", command: ["pnpm", ...command], config };
    writeJson(reportAbsolutePath, report);
    console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
    return 0;
  }

  if (!commandExists("pnpm")) {
    console.error("pnpm is required to run Stryker via pnpm dlx.");
    return 1;
  }

  writeJson(reportAbsolutePath, {
    status: "running",
    command: ["pnpm", ...command],
    config,
  });
  const result = run("pnpm", command, { cwd: workspaceRoot, stdio: "inherit" });
  writeJson(reportAbsolutePath, {
    status: result.status === 0 ? "ok" : "failed",
    command: ["pnpm", ...command],
    config,
    exitCode: result.status,
  });

  return result.status;
}
