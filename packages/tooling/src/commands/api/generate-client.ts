#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { openApiContractByName } from "./contracts-manifest.ts";
function parseArgs(argv) { const auth = openApiContractByName("auth-app-api"); const args = { input: auth.artifactPath, output: "libs/frontend/api-client/lib/src/generated.ts", dryRun: false }; for (let i = 0; i < argv.length; i += 1) { const item = argv[i]; if (item === "--") continue; const val = () => { const next = argv[++i]; if (!next) throw new Error(`${item} requires a value.`); return next; }; if (item === "--input") args.input = val(); else if (item === "--output") args.output = val(); else if (item === "--dry-run") args.dryRun = true; else if (item === "--help" || item === "-h") args.help = true; else throw new Error(`Unknown option: ${item}`); } return args; }
const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log("Usage: pnpm api:client -- [--input apps/backend/auth-app-api-contracts/openapi/auth-app-api.json] [--output libs/frontend/api-client/lib/src/generated.ts]"); process.exit(0); }
const command = ["pnpm", "exec", "openapi-typescript", args.input, "-o", args.output];
if (args.dryRun) { console.log(JSON.stringify({ status: "dry-run", command }, null, 2)); process.exit(0); }
if (!existsSync(args.input)) throw new Error(`OpenAPI input not found: ${args.input}. Run pnpm api:contracts first.`);
const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
process.exit(result.status ?? 1);
