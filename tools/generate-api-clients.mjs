#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const generatedRoot = "libs/frontend/api-client/lib/src/generated";
const services = [
  {
    name: "auth",
    input: "docs/openapi/auth-app-api.json",
    output: `${generatedRoot}/auth.ts`,
  },
  {
    name: "user",
    input: "docs/openapi/user-app-api.json",
    output: `${generatedRoot}/user.ts`,
  },
  {
    name: "admin",
    input: "docs/openapi/admin-app-api.json",
    output: `${generatedRoot}/admin.ts`,
  },
];

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: pnpm api:clients -- [--dry-run]");
    return;
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify({ status: "dry-run", generatedRoot, services }, null, 2),
    );
    return;
  }

  rmSync(generatedRoot, { recursive: true, force: true });
  mkdirSync(generatedRoot, { recursive: true });

  for (const service of services) {
    mkdirSync(dirname(service.output), { recursive: true });
    run("pnpm", [
      "exec",
      "openapi-typescript",
      service.input,
      "-o",
      service.output,
      "--root-types=true",
      "--root-types-no-schema-prefix=true",
    ]);
  }

  run("pnpm", [
    "exec",
    "prettier",
    "--write",
    ...services.map((service) => service.output),
  ]);
  console.log(JSON.stringify({ status: "generated", generatedRoot, services }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
