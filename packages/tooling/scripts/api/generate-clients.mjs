#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
const generatedRoot = "libs/frontend/api-client/lib/src/generated";
const services = [
  { name: "auth", input: "contracts/openapi/auth-app-api.json", output: `${generatedRoot}/auth.ts` },
  { name: "user", input: "contracts/openapi/user-app-api.json", output: `${generatedRoot}/user.ts` },
  { name: "admin", input: "contracts/openapi/admin-app-api.json", output: `${generatedRoot}/admin.ts` },
];
function parseArgs(argv) { const args = { dryRun: false, contractsRoot: "contracts/openapi" }; for (let i = 0; i < argv.length; i += 1) { const item = argv[i]; if (item === "--") continue; const val = () => argv[++i] ?? (() => { throw new Error(`${item} requires a value.`); })(); if (item === "--dry-run") args.dryRun = true; else if (item === "--contracts-root" || item === "--docs-root") args.contractsRoot = val(); else if (item === "--help" || item === "-h") args.help = true; else throw new Error(`Unknown option: ${item}`); } return args; }
function run(command, args) { const result = spawnSync(command, args, { stdio: "inherit" }); if (result.status !== 0) process.exit(result.status ?? 1); }
const args = parseArgs(process.argv.slice(2));
const planned = services.map((s) => ({ ...s, input: `${args.contractsRoot}/${s.input.split("/").at(-1)}` }));
if (args.help) { console.log("Usage: pnpm api:clients -- [--contracts-root contracts/openapi] [--dry-run]\nAlias: --docs-root is accepted for compatibility."); process.exit(0); }
if (args.dryRun) { console.log(JSON.stringify({ status: "dry-run", generatedRoot, services: planned }, null, 2)); process.exit(0); }
rmSync(generatedRoot, { recursive: true, force: true }); mkdirSync(generatedRoot, { recursive: true });
for (const service of planned) { mkdirSync(dirname(service.output), { recursive: true }); run("pnpm", ["exec", "openapi-typescript", service.input, "-o", service.output, "--root-types=true", "--root-types-no-schema-prefix=true"]); }
run("pnpm", ["exec", "prettier", "--write", ...planned.map((s) => s.output)]);
console.log(JSON.stringify({ status: "generated", generatedRoot, services: planned }));
