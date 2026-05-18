#!/usr/bin/env node
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = { config: "orval.config.mjs", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--config") args.config = val();
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
      "Usage: pnpm api:clients -- [--config orval.config.mjs] [--dry-run]",
    );
    return;
  }
  const command = ["pnpm", "exec", "orval", "--config", args.config];
  if (args.dryRun) {
    console.log(JSON.stringify({ status: "dry-run", command }, null, 2));
    return;
  }
  rmSync("libs/frontend/api-client/src/generated", {
    recursive: true,
    force: true,
  });
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
