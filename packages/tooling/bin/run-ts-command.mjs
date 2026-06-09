#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";

const [modulePath, ...args] = process.argv.slice(2);

if (!modulePath) {
  console.error("Usage: run-ts-command <module-path> [args]");
  process.exit(2);
}

const absoluteModulePath = resolve(process.cwd(), modulePath);
if (!existsSync(absoluteModulePath)) {
  console.error(`Tooling command module not found: ${modulePath}`);
  process.exit(1);
}

process.argv = [process.argv[0] ?? "node", absoluteModulePath, ...args];

const jiti = createJiti(import.meta.url);
await jiti.import(absoluteModulePath);
