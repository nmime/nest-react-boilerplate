#!/usr/bin/env node
import { spawnSync } from "node:child_process"; const command = ["pnpm", "dlx", "@stryker-mutator/core", "run", "stryker.config.mjs"]; if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ status: "dry-run", command }, null, 2)); process.exit(0); } const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" }); process.exit(result.status ?? 1);
