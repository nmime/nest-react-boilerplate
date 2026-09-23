#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isMigrationFilePath } from "./migration-naming.ts";
import { collectMigrationStandardErrors } from "./migration-standards.ts";

const repoRoot = process.cwd();
const errors: string[] = [];
const skippedDirectories = new Set([
  ".git",
  ".nx",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function listFiles(root: string) {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (skippedDirectories.has(name)) continue;
      const path = join(dir, name);
      const stat = statSync(path, { throwIfNoEntry: false });
      if (!stat) continue;
      if (stat.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

const migrationFiles = listFiles(join(repoRoot, "libs")).filter(isMigrationFilePath);
for (const file of migrationFiles) {
  for (const message of collectMigrationStandardErrors(readFileSync(file, "utf8"))) {
    errors.push(`${relative(repoRoot, file)}: ${message}`);
  }
}
if (errors.length) {
  console.error("Database migration standards check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", checked: migrationFiles.length }));
