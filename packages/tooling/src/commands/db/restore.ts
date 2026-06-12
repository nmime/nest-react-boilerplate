#!/usr/bin/env node
// @ts-nocheck
import { existsSync } from "node:fs";
import {
  createPostgresClientInvocation,
  runPostgresClient,
} from "./postgres-client.ts";
import {
  assertLocalDevelopmentDatabase,
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.ts";

function parseArgs(argv) {
  const args = { dryRun: false, force: false, yes: false, input: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--force") args.force = true;
    else if (item === "--yes") args.yes = true;
    else if (item === "--input") args.input = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: repo-tooling db restore --input backups/app.dump --yes [--dry-run] [--force]");
  process.exit(0);
}
if (!args.input) throw new Error("--input is required.");

loadDotEnv();
const connectionString = postgresConnectionString();
if (!args.force) assertLocalDevelopmentDatabase(connectionString);
const plan = createPostgresClientInvocation({
  connectionString,
  operation: "restore",
  outputPath: args.input,
});

if (args.dryRun) {
  console.log(
    JSON.stringify(
      {
        status: "dry-run",
        database: redactedConnectionString(connectionString),
        input: args.input,
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

if (!args.yes) throw new Error("Refusing restore without --yes.");
if (!existsSync(args.input)) throw new Error(`Backup file not found: ${args.input}`);
const status = runPostgresClient({ connectionString, operation: "restore", outputPath: args.input });
if (status !== 0) process.exit(status);
console.log(
  JSON.stringify({
    status: "restored",
    database: redactedConnectionString(connectionString),
    input: args.input,
  }),
);
