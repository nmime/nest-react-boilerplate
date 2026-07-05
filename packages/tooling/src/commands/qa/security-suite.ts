#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { run } from "./runtime-utils.ts";

const passthrough = process.argv.slice(2);
const scripts = ["security-sast.ts", "secret-scan.ts", "security-dast.ts"];
for (const script of scripts) {
  const scriptPath = fileURLToPath(new URL(script, import.meta.url));
  const result = run(process.execPath, ["packages/tooling/bin/run-ts-command.mjs", scriptPath, ...passthrough], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status);
}
console.log(JSON.stringify({ status: "ok", presets: scripts }));
