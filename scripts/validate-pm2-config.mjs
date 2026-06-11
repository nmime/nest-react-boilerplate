#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const candidates = [
  "ecosystem.config.js",
  "ecosystem.config.cjs",
  "ecosystem.config.mjs",
];
const configPath = candidates.find((path) =>
  existsSync(new URL(`../${path}`, import.meta.url)),
);

if (!configPath) {
  console.log(
    "PM2 validation skipped: no ecosystem.config.{js,cjs,mjs} file is present for this optional deployment mode.",
  );
  process.exit(0);
}

const config = readFileSync(
  new URL(`../${configPath}`, import.meta.url),
  "utf8",
);
assert.match(config, /apps\s*:/u, `${configPath} must define an apps array`);
assert.ok(
  !config.includes(".env.production"),
  `${configPath} must not inline production env-file secrets; pass secrets through the runtime environment.`,
);
console.log(`pm2 static assertions passed (${configPath})`);
