#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const errors = [];
const skippedDirectories = new Set([
  ".git",
  ".nx",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function listFiles(root) {
  const files = [];
  const visit = (dir) => {
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

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function unquote(identifier) {
  return identifier.replace(/^"|"$/g, "");
}
function columnsFromName(name) {
  return name
    .split(",")
    .map((part) =>
      unquote(part.trim())
        .replace(/\W+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("_");
}
function fail(file, message) {
  errors.push(`${relative(repoRoot, file)}: ${message}`);
}
function validate(file, sql) {
  const normalized = normalizeSql(sql).toLowerCase();
  if (
    /\bcreate\s+type\b[\s\S]*\bas\s+enum\b/.test(normalized) ||
    /\benum\s*\(/.test(normalized)
  ) {
    fail(
      file,
      "PostgreSQL ENUM types are not allowed; use VARCHAR plus a CHECK constraint.",
    );
  }
  for (const match of sql.matchAll(
    /alter\s+table\s+"?([a-zA-Z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z0-9_]+"?\s+[^;]+);/gi,
  )) {
    if (!/\bnot\s+null\b/i.test(match[2])) {
      fail(
        file,
        `ALTER TABLE ${match[1]} ADD COLUMN must define the column as NOT NULL: ${match[2].trim()}`,
      );
    }
  }
  for (const match of sql.matchAll(
    /create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?\s+on\s+"?([a-zA-Z0-9_]+)"?\s*\(([^)]+)\)/gi,
  )) {
    const expected = `${match[1] ? "uq" : "ix"}__${match[3]}__${columnsFromName(match[4])}`;
    if (match[2] !== expected) {
      fail(file, `index must be named ${expected}, got ${match[2]}`);
    }
  }
  for (const match of sql.matchAll(
    /constraint\s+"?([a-zA-Z0-9_]+)"?\s+foreign\s+key\s*\(([^)]+)\)/gi,
  )) {
    if (!/^fk__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(match[1])) {
      fail(file, `foreign key name must match fk__{table}__{column}: ${match[1]}`);
    }
  }
  for (const match of sql.matchAll(
    /constraint\s+"?([a-zA-Z0-9_]+)"?\s+check\b/gi,
  )) {
    if (!/^ck__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(match[1])) {
      fail(file, `check constraint name must match ck__{table}__{rule}: ${match[1]}`);
    }
  }
}

const migrationFiles = listFiles(join(repoRoot, "libs")).filter((file) =>
  /\/migrations\/Migration\d+.*\.ts$/.test(file),
);
for (const file of migrationFiles) validate(file, readFileSync(file, "utf8"));
if (errors.length) {
  console.error("Database migration standards check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", checked: migrationFiles.length }));
