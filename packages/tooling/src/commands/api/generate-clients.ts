#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { openApiContracts, type OpenApiContract } from "./contracts-manifest.ts";
import { renderOperationsModule, type OpenApiDocument } from "./generate-operations.ts";

const generatedRoot = "libs/frontend/api-client/lib/src/generated";

interface GenerateClientsArgs {
  dryRun: boolean;
  generatedRoot: string;
  contractsRoot?: string;
  help?: boolean;
  /**
   * Emit only the derived operations modules, skipping the `openapi-typescript` and `prettier`
   * passes. Those are the only steps that shell out, so this is the mode in which the emitter can
   * be exercised from a checkout whose frontend toolchain is not installed. `api:clients:check`
   * never uses it: both sides of that diff must come from the same full pipeline.
   */
  operationsOnly?: boolean;
}

function parseArgs(argv: string[]): GenerateClientsArgs {
  const args: GenerateClientsArgs = { dryRun: false, generatedRoot };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--operations-only") args.operationsOnly = true;
    else if (item === "--contracts-root" || item === "--docs-root")
      args.contractsRoot = val();
    else if (item === "--generated-root") args.generatedRoot = val();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function serviceInput(contract: OpenApiContract, args: GenerateClientsArgs) {
  return args.contractsRoot
    ? join(args.contractsRoot, `${contract.name}.json`)
    : contract.artifactPath;
}

function serviceOutput(contract: OpenApiContract, args: GenerateClientsArgs) {
  return args.generatedRoot === generatedRoot
    ? contract.clientOutputPath
    : join(
        args.generatedRoot,
        contract.clientOutputPath.split("/").at(-1) ?? contract.clientOutputPath,
      );
}

const args = parseArgs(process.argv.slice(2));
const planned = openApiContracts().map((contract) => {
  const output = serviceOutput(contract, args);
  return {
    name: contract.name,
    input: serviceInput(contract, args),
    output,
    operationsOutput: output.replace(/\.ts$/u, ".operations.ts"),
  };
});

if (args.help) {
  console.log(
    "Usage: pnpm api:clients -- [--contracts-root <temporary-root>] [--generated-root libs/frontend/api-client/lib/src/generated] [--operations-only] [--dry-run]\nEmits the openapi-typescript types plus a derived <service>.operations.ts carrying one callable, response/data/error aliases, and a query or mutation key per operation.\nDefault OpenAPI artifact paths come from packages/tooling/config/api-contracts.json. Alias: --docs-root is accepted for compatibility.",
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

// Only remove the client-owned outputs so co-located generated artifacts such as
// generated/toast/*.json (written by `api toast-config generate`) are preserved.
mkdirSync(args.generatedRoot, { recursive: true });
for (const service of planned) {
  rmSync(service.output, { recursive: true, force: true });
  rmSync(service.operationsOutput, { recursive: true, force: true });
}
for (const service of planned) {
  mkdirSync(dirname(service.output), { recursive: true });
  if (!args.operationsOnly) {
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
  const document = JSON.parse(readFileSync(service.input, "utf8")) as OpenApiDocument;
  writeFileSync(
    service.operationsOutput,
    renderOperationsModule(document, {
      typesModule: `./${basename(service.output).replace(/\.ts$/u, "")}`,
      sourcePath: service.input,
    }),
  );
}
if (!args.operationsOnly) {
  run("pnpm", [
    "exec",
    "prettier",
    "--write",
    "--config",
    resolve(".prettierrc"),
    "--ignore-unknown",
    "--ignore-path",
    process.platform === "win32" ? "NUL" : "/dev/null",
    ...planned.flatMap((service) => [service.output, service.operationsOutput]),
  ]);
}
console.log(
  JSON.stringify({
    status: "generated",
    generatedRoot: args.generatedRoot,
    services: planned,
    source: "packages/tooling/config/api-contracts.json",
  }),
);
