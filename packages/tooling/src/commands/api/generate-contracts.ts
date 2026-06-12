#!/usr/bin/env node
// @ts-nocheck
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { openApiContracts } from "./contracts-manifest.ts";

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => { const next = argv[++i]; if (!next) throw new Error(`${item} requires a value.`); return next; };
    if (item === "--contracts-root" || item === "--docs-root") args.contractsRoot = val();
    else if (item === "--types-root") args.typesRoot = val();
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function readPositiveIntegerEnv(name, fallback) { const value = Number.parseInt(process.env[name] ?? "", 10); return Number.isFinite(value) && value > 0 ? value : fallback; }
async function fetchOpenApi({ app, port, output }) { const env = { ...process.env, OPENAPI_ENABLED: "true", OPENAPI_PATH: "docs", AUTH_PERSISTENCE: "memory", AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? "openapi-export-only", AUTH_OAUTH_ENABLED: "false", PORT: String(port) }; const command = ["pnpm", "exec", "nx", "serve", app]; const readyAttempts = readPositiveIntegerEnv("OPENAPI_READY_ATTEMPTS", 240); const child = spawn(command[0], command.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] }); let logs = ""; child.stdout.on("data", (c) => { logs += c.toString(); }); child.stderr.on("data", (c) => { logs += c.toString(); }); try { const url = `http://127.0.0.1:${port}/docs/openapi.json`; let body = ""; for (let attempt = 0; attempt < readyAttempts; attempt += 1) { try { const response = await fetch(url); if (response.ok) { body = await response.text(); break; } } catch {} await wait(1000); } if (!body) throw new Error(`${app} OpenAPI endpoint did not become ready after ${readyAttempts} attempts. Logs:
${logs.slice(-4000)}`); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(JSON.parse(body), null, 2)}
`); } finally { child.kill("SIGTERM"); await wait(500); if (!child.killed) child.kill("SIGKILL"); } }
function generateTypes({ input, output }) { mkdirSync(dirname(output), { recursive: true }); const result = spawnSync("pnpm", ["exec", "openapi-typescript", input, "-o", output], { stdio: "inherit" }); if (result.status !== 0) process.exit(result.status ?? 1); }
function format(paths) { const result = spawnSync("pnpm", ["exec", "prettier", "--write", "--ignore-path", "/dev/null", ...paths.map((path) => resolve(path))], { stdio: "inherit" }); if (result.status !== 0) process.exit(result.status ?? 1); }
function artifactOutput(contract, args) { return args.contractsRoot ? join(args.contractsRoot, `${contract.name}.json`) : contract.artifactPath; }
function typesOutput(contract, args) { return args.typesRoot ? join(args.typesRoot, `${contract.name}.ts`) : contract.typesPath; }
const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log("Usage: repo-tooling api contracts [--contracts-root <temporary-root>] [--types-root libs/common/api-contracts/lib/src/generated] [--dry-run]\nDefault artifact paths come from packages/tooling/config/api-contracts.json. Alias: --docs-root is accepted for compatibility."); process.exit(0); }
const plan = openApiContracts().map((contract) => ({ ...contract, openApiOutput: artifactOutput(contract, args), typesOutput: typesOutput(contract, args) }));
if (args.dryRun) { console.log(JSON.stringify({ status: "dry-run", contracts: plan }, null, 2)); process.exit(0); }
for (const item of plan) { await fetchOpenApi({ app: item.app, port: item.port, output: item.openApiOutput }); generateTypes({ input: item.openApiOutput, output: item.typesOutput }); format([item.openApiOutput, item.typesOutput]); console.log(JSON.stringify({ status: "generated", app: item.app, openapi: item.openApiOutput, types: item.typesOutput, source: "packages/tooling/config/api-contracts.json" })); }
