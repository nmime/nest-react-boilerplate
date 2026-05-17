#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  assertLocalDevelopmentDatabase,
  loadDotEnv,
  postgresConnectionString,
  redactedConnectionString,
} from "./env-loader.mjs";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: pnpm db:restore -- --input backups/app.dump --yes [--dry-run] [--force]",
    );
    return;
  }
  if (!args.input) throw new Error("--input is required.");
  loadDotEnv();
  const connectionString = postgresConnectionString();
  if (!args.force) assertLocalDevelopmentDatabase(connectionString);
  const command = [
    "pg_restore",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--dbname",
    connectionString,
    args.input,
  ];
  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          status: "dry-run",
          database: redactedConnectionString(connectionString),
          input: args.input,
          command: [
            ...command.slice(0, 6),
            redactedConnectionString(connectionString),
            args.input,
          ],
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!args.yes) throw new Error("Refusing restore without --yes.");
  if (!existsSync(args.input))
    throw new Error(`Backup file not found: ${args.input}`);
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(
    JSON.stringify({
      status: "restored",
      database: redactedConnectionString(connectionString),
      input: args.input,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
