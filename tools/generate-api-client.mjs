#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function parseArgs(argv) {
  const args = {
    input: "docs/openapi/auth-app-api.json",
    output: "libs/frontend/api-client/lib/src/generated.ts",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--input") args.input = val();
    else if (item === "--output") args.output = val();
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: pnpm api:client -- [--input docs/openapi/auth-app-api.json] [--output libs/frontend/api-client/lib/src/generated.ts]",
    );
    return;
  }
  const command = [
    "pnpm",
    "exec",
    "openapi-typescript",
    args.input,
    "-o",
    args.output,
  ];
  if (args.dryRun) {
    console.log(JSON.stringify({ status: "dry-run", command }, null, 2));
    return;
  }
  if (!existsSync(args.input)) {
    throw new Error(
      `OpenAPI input not found: ${args.input}. Run pnpm api:openapi first.`,
    );
  }
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
