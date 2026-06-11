#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDotEnv, postgresConnectionString, redactedConnectionString } from "./env-loader.ts";

function parseArgs(argv) {
  const args = {
    ci: false,
    dryRun: false,
    force: false,
    yes: false,
    output: "",
    input: "",
    report: "test-results/dr/restore-drill.json",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--ci") args.ci = true;
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--force") args.force = true;
    else if (item === "--yes") args.yes = true;
    else if (item === "--output") args.output = val();
    else if (item === "--input") args.input = val();
    else if (item === "--report") args.report = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function runStep(label, command, args) {
  const result = spawnSync(command, args, { stdio: "pipe", encoding: "utf8" });
  return {
    label,
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function writeReport(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: repo-tooling db restore-drill [--ci] [--dry-run] [--output test-results/dr/postgres.dump] [--input existing.dump] [--yes] [--force] [--report path]");
  process.exit(0);
}

loadDotEnv();
const connectionString = postgresConnectionString();
const output = args.output || join("test-results", "dr", "postgres-restore-drill.dump");
const input = args.input || output;
const dryRun = args.dryRun || args.ci;
const steps = [];

if (dryRun) {
  steps.push(runStep("backup-dry-run", process.execPath, ["packages/tooling/bin/repo-tooling.mjs", "db", "backup", "--dry-run", "--output", output]));
  steps.push(runStep("restore-dry-run", process.execPath, ["packages/tooling/bin/repo-tooling.mjs", "db", "restore", "--dry-run", "--input", input, ...(args.force || args.ci ? ["--force"] : [])]));
} else {
  steps.push(runStep("backup", process.execPath, ["packages/tooling/bin/repo-tooling.mjs", "db", "backup", "--output", output]));
  if ((steps.at(-1)?.status ?? 1) === 0) {
    steps.push(runStep("restore", process.execPath, ["packages/tooling/bin/repo-tooling.mjs", "db", "restore", "--input", input, "--yes", ...(args.force ? ["--force"] : [])]));
  }
}

const ok = steps.every((step) => step.status === 0);
const report = {
  status: ok ? "ok" : "failed",
  mode: dryRun ? "ci-safe-dry-run" : "destructive-local-drill",
  database: redactedConnectionString(connectionString),
  output,
  input,
  rpoTargetMinutes: 60,
  rtoTargetMinutes: 60,
  steps,
};
writeReport(args.report, report);
console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
