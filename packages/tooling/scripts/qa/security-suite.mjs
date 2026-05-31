#!/usr/bin/env node
import { run } from "./runtime-utils.mjs";

const passthrough = process.argv.slice(2);
const scripts = ["security-sast.mjs", "secret-scan.mjs", "security-dast.mjs"];
for (const script of scripts) {
  const result = run(process.execPath, [new URL(script, import.meta.url).pathname, ...passthrough], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status);
}
console.log(JSON.stringify({ status: "ok", presets: scripts }));
