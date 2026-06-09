#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const generatedRoot = "libs/frontend/api-client/lib/src/generated";
const services = [
  {
    name: "auth",
    input: "contracts/openapi/auth-app-api.json",
    output: "auth.ts",
  },
  {
    name: "user",
    input: "contracts/openapi/user-app-api.json",
    output: "user.ts",
  },
  {
    name: "admin",
    input: "contracts/openapi/admin-app-api.json",
    output: "admin.ts",
  },
];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    contractsRoot: "contracts/openapi",
    generatedRoot,
  };
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

const args = parseArgs(process.argv.slice(2));
const planned = services.map((service) => ({
  ...service,
  input: `${args.contractsRoot}/${service.input.split("/").at(-1)}`,
  output: `${args.generatedRoot}/${service.output}`,
}));

if (args.help) {
  console.log(
    "Usage: pnpm api:clients -- [--contracts-root contracts/openapi] [--generated-root libs/frontend/api-client/lib/src/generated] [--dry-run]\nAlias: --docs-root is accepted for compatibility.",
  );
  process.exit(0);
}
if (args.dryRun) {
  console.log(
    JSON.stringify(
      {
        status: "dry-run",
        generatedRoot: args.generatedRoot,
        services: planned,
      },
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
  }),
);
