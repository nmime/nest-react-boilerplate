#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".nx",
  "tmp",
  "playwright-report",
  "test-results",
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function parseArgs(argv) {
  const args = { dryRun: false, force: false, nonInteractive: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--") continue;
    const readValue = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`${item} requires a value.`);
      }
      index += 1;
      return next;
    };
    if (item === "--dry-run") args.dryRun = true;
    else if (item === "--force") args.force = true;
    else if (item === "--non-interactive") args.nonInteractive = true;
    else if (item === "--name") args.name = readValue();
    else if (item === "--package-name") args.packageName = readValue();
    else if (item === "--app-slug") args.appSlug = readValue();
    else if (item === "--db-name") args.dbName = readValue();
    else if (item === "--domain") args.domain = readValue();
    else if (item === "--owner") args.owner = readValue();
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function usage() {
  console.log(
    `Usage: pnpm init:project -- --name "Acme App" [options]\n\nOptions:\n  --package-name <name>   package.json name; defaults to slugified --name\n  --app-slug <slug>       URL/image-safe app slug; defaults to package name\n  --db-name <name>        PostgreSQL database; defaults to snake_case name\n  --domain <domain>       production domain placeholder; defaults to example.com\n  --owner <github-user>   CODEOWNERS/default package owner placeholder\n  --dry-run               print planned replacements without writing files\n  --non-interactive       fail instead of prompting for missing --name\n  --force                 allow a dirty worktree\n\nThe script replaces known boilerplate tokens only and does not rewrite Git history.`,
  );
}

const slugify = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
const snake = (value) => slugify(value).replaceAll("-", "_");
const pascal = (value) =>
  slugify(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
const title = (value) => value.trim().replace(/\s+/gu, " ");

async function resolveConfig(args) {
  if (!args.name && !args.nonInteractive && process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    args.name = await rl.question("Project name: ");
    rl.close();
  }
  if (!args.name) {
    throw new Error("--name is required in non-interactive mode.");
  }
  const appTitle = title(args.name);
  const appSlug = args.appSlug ?? args.packageName ?? slugify(appTitle);
  return {
    appTitle,
    appSlug,
    packageName: args.packageName ?? appSlug,
    dbName: args.dbName ?? snake(appTitle),
    className: pascal(appTitle),
    domain: args.domain ?? "example.com",
    owner: args.owner ?? "your-github-org",
  };
}

function gitStatus() {
  try {
    return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  } catch {
    return "";
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else if (stat.isFile()) {
      const dot = path.lastIndexOf(".");
      const extension = dot === -1 ? "" : path.slice(dot);
      if (TEXT_EXTENSIONS.has(extension)) yield path;
    }
  }
}

function replacements(config) {
  const domain = config.domain;
  return new Map([
    ["Nest React Boilerplate", config.appTitle],
    ["nest-react-boilerplate", config.appSlug],
    ["nest_react_boilerplate", config.dbName],
    ["nest-react-boilerplate-api", `${config.appSlug}-api`],
    ["NestReactBoilerplate", config.className],
    ["admin.example.com", `admin.${domain}`],
    ["app.example.com", `app.${domain}`],
    ["auth.example.com", `auth.${domain}`],
    ["issuer.example.com", `issuer.${domain}`],
    ["user@example.com", `user@${domain}`],
    ["admin@example.com", `admin@${domain}`],
    ["your-github-org", config.owner],
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const status = gitStatus();
  if (status.trim() && !args.force) {
    throw new Error(
      "Refusing to initialize with a dirty worktree. Commit/stash changes or pass --force.",
    );
  }
  const config = await resolveConfig(args);
  const changes = [];
  const reps = replacements(config);
  for (const path of walk(ROOT)) {
    const before = readFileSync(path, "utf8");
    let after = before;
    for (const [from, to] of reps) after = after.split(from).join(to);
    if (after !== before) {
      changes.push({ path: relative(ROOT, path), after });
    }
  }
  if (!args.dryRun) {
    for (const change of changes)
      writeFileSync(join(ROOT, change.path), change.after);
    const packagePath = join(ROOT, "package.json");
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
      pkg.name = config.packageName;
      writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    }
  }
  console.log(
    JSON.stringify(
      {
        status: args.dryRun ? "dry-run" : "updated",
        config,
        filesChanged: changes.length,
        files: changes.slice(0, 50).map((change) => change.path),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
