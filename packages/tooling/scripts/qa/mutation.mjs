#!/usr/bin/env node
import { existsSync } from "node:fs";
import { commandExists, parseArgs, run, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const config = args.options.get("config") ?? process.env.STRYKER_CONFIG ?? "stryker.config.mjs";
const reportPath = args.options.get("report") ?? "test-results/mutation/command.json";
const command = ["dlx", "@stryker-mutator/core@9.6.1", "run", config, ...args.positional];
if (!existsSync(config)) {
  console.error(`Stryker config not found: ${config}`);
  process.exit(1);
}
if (args.flags.has("dry-run")) {
  writeJson(reportPath, { status: "dry-run", command: ["pnpm", ...command], config });
  console.log(JSON.stringify({ status: "dry-run", command: ["pnpm", ...command], config, report: reportPath }, null, 2));
  process.exit(0);
}
if (!commandExists("pnpm")) {
  console.error("pnpm is required to run Stryker via pnpm dlx.");
  process.exit(1);
}
if (process.env.STRYKER_RUN !== "1" && process.env.MUTATION_REQUIRED !== "1") {
  writeJson(reportPath, {
    status: "skipped",
    command: ["pnpm", ...command],
    config,
    reason: "Mutation testing is intentionally opt-in for local quality presets; set STRYKER_RUN=1 to enforce thresholds.",
  });
  console.log(JSON.stringify({
    status: "skipped",
    preset: "mutation",
    reason: "Set STRYKER_RUN=1 to run Stryker mutation thresholds",
    report: reportPath,
  }));
  process.exit(0);
}
writeJson(reportPath, { status: "running", command: ["pnpm", ...command], config });
const result = run("pnpm", command, { stdio: "inherit" });
writeJson(reportPath, { status: result.status === 0 ? "ok" : "failed", command: ["pnpm", ...command], config, exitCode: result.status });
process.exit(result.status);
