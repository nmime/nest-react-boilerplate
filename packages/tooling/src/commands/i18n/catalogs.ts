#!/usr/bin/env node
/**
 * CLI entry for the locale-derived artifacts: the per-consumer catalog binding modules and the
 * translation-key module. `--check` reports drift without writing, which is the form CI runs.
 */
import { runI18nCheck, runI18nGenerate } from "./index.ts";

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const workspaceRoot = process.cwd();

if (checkOnly) {
  const stale = runI18nCheck({ workspaceRoot });
  if (stale.length > 0) {
    for (const path of stale) process.stderr.write(`Stale generated locale artifact: ${path}\n`);
    process.stderr.write("Run `pnpm run i18n:catalogs` and commit the result.\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(JSON.stringify({ status: "ok", stale: [] }) + "\n");
  }
} else {
  const { changed } = runI18nGenerate({ workspaceRoot });
  process.stdout.write(JSON.stringify({ status: "ok", changed }) + "\n");
}
