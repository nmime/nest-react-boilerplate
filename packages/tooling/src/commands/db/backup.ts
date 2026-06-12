#!/usr/bin/env node
// @ts-nocheck
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createPostgresClientInvocation,
  runPostgresClient,
} from "./postgres-client.ts";
import {
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.ts";

function parseArgs(argv) {
  const args = { dryRun: false, output: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--output") args.output = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: repo-tooling db backup [--dry-run] [--output backups/app.dump]");
  process.exit(0);
}

loadDotEnv();
const connectionString = postgresConnectionString();
const output =
  args.output ||
  join("backups", `postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}.dump`);
const plan = createPostgresClientInvocation({
  connectionString,
  operation: "backup",
  outputPath: output,
});

if (args.dryRun) {
  console.log(
    JSON.stringify(
      {
        status: "dry-run",
        database: redactedConnectionString(connectionString),
        output,
        mode: plan.mode,
        clientImage: plan.mode === "docker" ? plan.image : undefined,
        command: plan.selected.redactedCommand,
        reason: plan.reason,
        warning: plan.warning,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

mkdirSync(output.includes("/") ? output.slice(0, output.lastIndexOf("/")) : ".", {
  recursive: true,
});
const status = runPostgresClient({ connectionString, operation: "backup", outputPath: output });
if (status !== 0) process.exit(status);
console.log(
  JSON.stringify({
    status: "backed-up",
    database: redactedConnectionString(connectionString),
    output,
  }),
);
