#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  openApiContracts,
  type OpenApiContract,
} from "./contracts-manifest.ts";
import { isOpenApiPreviewApplication, runOpenApiPreview } from "./openapi-preview.ts";

interface GenerateContractsArgs {
  dryRun: boolean;
  contractsRoot?: string;
  typesRoot?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): GenerateContractsArgs {
  const args: GenerateContractsArgs = { dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--") continue;

    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };

    if (item === "--contracts-root" || item === "--docs-root") {
      args.contractsRoot = value();
    } else if (item === "--types-root") {
      args.typesRoot = value();
    } else if (item === "--dry-run") {
      args.dryRun = true;
    } else if (item === "--help" || item === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${item}`);
    }
  }

  return args;
}

function writeOpenApi({
  app,
  output,
}: {
  app: string;
  output: string;
}): void {
  if (!isOpenApiPreviewApplication(app)) {
    throw new Error(`OpenAPI preview is not configured for ${app}.`);
  }
  runOpenApiPreview(app, output);
}

function generateTypes({ input, output }: { input: string; output: string }) {
  mkdirSync(dirname(output), { recursive: true });
  const result = spawnSync(
    "pnpm",
    ["exec", "openapi-typescript", input, "-o", output],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function format(paths: string[]) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "prettier",
      "--write",
      "--config",
      resolve(".prettierrc"),
      "--ignore-path",
      "/dev/null",
      ...paths.map((path) => resolve(path)),
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function artifactOutput(
  contract: OpenApiContract,
  args: GenerateContractsArgs,
) {
  return args.contractsRoot
    ? join(args.contractsRoot, `${contract.name}.json`)
    : contract.artifactPath;
}

function typesOutput(contract: OpenApiContract, args: GenerateContractsArgs) {
  return args.typesRoot
    ? join(args.typesRoot, `${contract.name}.ts`)
    : contract.typesPath;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    "Usage: repo-tooling api contracts [--contracts-root <temporary-root>] [--types-root libs/common/api-contracts/lib/src/generated] [--dry-run]\nDefault artifact paths come from packages/tooling/config/api-contracts.json. Alias: --docs-root is accepted for compatibility.",
  );
  process.exit(0);
}

const plan = openApiContracts().map((contract) => ({
  ...contract,
  openApiOutput: artifactOutput(contract, args),
  typesOutput: typesOutput(contract, args),
}));

if (args.dryRun) {
  console.log(JSON.stringify({ status: "dry-run", contracts: plan }, null, 2));
  process.exit(0);
}

for (const item of plan) {
  writeOpenApi({
    app: item.app,
    output: item.openApiOutput,
  });
  generateTypes({ input: item.openApiOutput, output: item.typesOutput });
  format([item.openApiOutput, item.typesOutput]);
  console.log(
    JSON.stringify({
      status: "generated",
      app: item.app,
      openapi: item.openApiOutput,
      types: item.typesOutput,
      source: "packages/tooling/config/api-contracts.json",
    }),
  );
}
