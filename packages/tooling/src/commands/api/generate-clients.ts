#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { openApiContracts } from "./contracts-manifest.ts";

const generatedRoot = "libs/frontend/api-client/lib/src/generated";

function parseArgs(argv) {
  const args = { dryRun: false, generatedRoot };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--contracts-root" || item === "--docs-root")
      args.contractsRoot = val();
    else if (item === "--generated-root") args.generatedRoot = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function serviceInput(contract, args) {
  return args.contractsRoot
    ? join(args.contractsRoot, `${contract.name}.json`)
    : contract.artifactPath;
}

function serviceOutput(contract, args) {
  return args.generatedRoot === generatedRoot
    ? contract.clientOutputPath
    : join(args.generatedRoot, contract.clientOutputPath.split("/").at(-1));
}

const args = parseArgs(process.argv.slice(2));
const planned = openApiContracts().map((contract) => ({
  name: contract.name,
  input: serviceInput(contract, args),
  output: serviceOutput(contract, args),
}));

if (args.help) {
  console.log(
    "Usage: pnpm api:clients -- [--contracts-root <temporary-root>] [--generated-root libs/frontend/api-client/lib/src/generated] [--dry-run]\nDefault OpenAPI artifact paths come from config/api-contracts.json. Alias: --docs-root is accepted for compatibility.",
  );
  process.exit(0);
}
if (args.dryRun) {
  console.log(
    JSON.stringify(
      { status: "dry-run", generatedRoot: args.generatedRoot, services: planned },
      null,
      2,
    ),
  );
  process.exit(0);
}

rmSync(args.generatedRoot, { recursive: true, force: true });
mkdirSync(args.generatedRoot, { recursive: true });
for (const service of planned) {
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
  "--ignore-unknown",
  "--ignore-path",
  process.platform === "win32" ? "NUL" : "/dev/null",
  ...planned.map((service) => service.output),
]);
console.log(
  JSON.stringify({
    status: "generated",
    generatedRoot: args.generatedRoot,
    services: planned,
    source: "config/api-contracts.json",
  }),
);
