#!/usr/bin/env node
// @ts-nocheck
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { OPENAPI_CONTRACT_FILES } from "./contract-layout";

function parseArgs(argv) {
  const args = { app: "auth-app-api", output: OPENAPI_CONTRACT_FILES.auth, port: "3999", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => { const next = argv[++i]; if (!next) throw new Error(`${item} requires a value.`); return next; };
    if (item === "--app") args.app = val();
    else if (item === "--output") args.output = val();
    else if (item === "--port") args.port = val();
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log("Usage: repo-tooling api openapi [--app auth-app-api] [--output libs/common/api-contracts/openapi/auth-app-api.json] [--dry-run]"); return; }
  const env = { ...process.env, OPENAPI_ENABLED: "true", OPENAPI_PATH: "docs", AUTH_PERSISTENCE: "memory", AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? "openapi-export-only", AUTH_OAUTH_ENABLED: "false", PORT: args.port };
  const command = ["pnpm", "exec", "nx", "serve", args.app];
  const url = `http://127.0.0.1:${args.port}/docs/openapi.json`;
  if (args.dryRun) { console.log(JSON.stringify({ status: "dry-run", command, url, output: args.output }, null, 2)); return; }
  const child = spawn(command[0], command.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  try {
    let body = "";
    for (let attempt = 0; attempt < 60; attempt += 1) { try { const response = await fetch(url); if (response.ok) { body = await response.text(); break; } } catch {} await wait(1000); }
    if (!body) throw new Error(`OpenAPI endpoint did not become ready. Logs:\n${logs.slice(-4000)}`);
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
    console.log(JSON.stringify({ status: "exported", app: args.app, output: args.output }));
  } finally { child.kill("SIGTERM"); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
