#!/usr/bin/env node
/**
 * init-project — delegate to shared setup/planner/apply engine.
 *
 * Preserves documented flags and output contract:
 *   --dry-run, --force, --non-interactive
 *   --name, --package-name, --app-slug, --db-name, --domain, --apex-app, --owner
 *   --help / -h
 *   Git dirty-tree guard (refuses unless --force)
 *   JSON output: { status, config, filesChanged, files }
 *
 * All filesystem writes go through the shared operation/apply engine
 * with createNodeFilesystem adapter — no direct writeFileSync calls.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { createNodeFilesystem } from "../../setup/adapters/node-filesystem.js";
import { apply, type ApplyOptions } from "../../setup/apply.js";
import { createFile, updateFile, type SetupOperation } from "../../setup/operations.js";
import { emptyState } from "../../setup/state.js";

// ---------------------------------------------------------------------------
// Constants — unchanged from original
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "coverage", ".nx",
  "tmp", "playwright-report", "test-results",
]);
const TEXT_EXTENSIONS = new Set([
  "", ".cjs", ".css", ".html", ".js", ".json", ".md",
  ".mjs", ".mts", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

// ---------------------------------------------------------------------------
// Argument parser — unchanged interface
// ---------------------------------------------------------------------------

interface InitProjectArgs {
  dryRun: boolean;
  force: boolean;
  nonInteractive: boolean;
  name?: string;
  packageName?: string;
  appSlug?: string;
  dbName?: string;
  domain?: string;
  apexApp?: string;
  owner?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): InitProjectArgs {
  const args: InitProjectArgs = { dryRun: false, force: false, nonInteractive: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    const readValue = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
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
    else if (item === "--apex-app") args.apexApp = readValue();
    else if (item === "--owner") args.owner = readValue();
    else if (item === "--help" || item === "-h") args.help = true;
    else if (item !== "--") throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Name transformations — unchanged from original
// ---------------------------------------------------------------------------

const slugify = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
const snake = (value: string) => slugify(value).replaceAll("-", "_");
const pascal = (value: string) =>
  slugify(value)
    .split("-")
    .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
const title = (value: string) => value.trim().replace(/\s+/gu, " ");

// ---------------------------------------------------------------------------
// Config builder — unchanged from original
// ---------------------------------------------------------------------------

interface InitConfig {
  appTitle: string;
  appSlug: string;
  packageName: string;
  dbName: string;
  className: string;
  domain: string;
  apexApp: "landing-app" | "site-app";
  owner: string;
}

function buildConfig(args: InitProjectArgs): InitConfig {
  if (!args.name) throw new Error("--name is required in non-interactive mode.");
  if (!args.domain) throw new Error("--domain is required so every public app and API receives a product-owned hostname.");
  const appTitle = title(args.name);
  const appSlug = args.appSlug ?? args.packageName ?? slugify(appTitle);
  const domain = normalizeDomain(args.domain);
  const apexApp = args.apexApp ?? "landing-app";
  if (apexApp !== "landing-app" && apexApp !== "site-app") {
    throw new Error('--apex-app must be either "landing-app" or "site-app".');
  }
  return {
    appTitle,
    appSlug,
    packageName: args.packageName ?? appSlug,
    dbName: args.dbName ?? snake(appTitle),
    className: pascal(appTitle),
    domain,
    apexApp,
    owner: args.owner ?? "your-github-org",
  };
}

function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/u, "");
  const labels = domain.split(".");
  const isValidLabel = (label: string): boolean =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label);

  if (
    domain.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !isValidLabel(label))
  ) {
    throw new Error(
      `--domain must be a DNS base name without a protocol, port, path, or wildcard (received "${value}").`,
    );
  }

  return domain;
}

// ---------------------------------------------------------------------------
// Walk + diff — unchanged from original
// ---------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else if (stat.isFile()) {
      const dot = path.lastIndexOf(".");
      const name = basename(path);
      const isEnvironmentExample = name.startsWith(".env.") && name.endsWith(".example");
      if (isEnvironmentExample || TEXT_EXTENSIONS.has(dot === -1 ? "" : path.slice(dot))) yield path;
    }
  }
}

// ---------------------------------------------------------------------------
// Build replacement map — unchanged from original
// ---------------------------------------------------------------------------

function buildReplacements(c: InitConfig): Map<string, string> {
  return new Map([
    ["Nest React Boilerplate", c.appTitle],
    ["nest-react-boilerplate", c.appSlug],
    ["nest_react_boilerplate", c.dbName],
    ["nest-react-boilerplate-api", `${c.appSlug}-api`],
    ["NestReactBoilerplate", c.className],
    ["your-github-org", c.owner],
    // Keep this last: landing-app owns the apex while every other deployable
    // uses <app-id>.example.com. Replacing the root updates both forms plus
    // staging hosts, TLS SANs, CSP, environment examples, and deployment docs.
    ["example.com", c.domain],
  ]);
}

// ---------------------------------------------------------------------------
// Build operations from diff — delegates to shared engine
// ---------------------------------------------------------------------------

function buildOperations(
  root: string,
  reps: Map<string, string>,
  config: InitConfig,
): Array<{ path: string; after: string }> {
  const changes: Array<{ path: string; after: string }> = [];
  for (const absPath of walk(root)) {
    const before = readFileSync(absPath, "utf8");
    let after = before;
    for (const [from, to] of reps) after = after.split(from).join(to);
    after = applyApexHostSelection(after, config);
    if (after !== before) {
      changes.push({ path: relative(root, absPath), after });
    }
  }
  return changes;
}

function applyApexHostSelection(content: string, config: InitConfig): string {
  if (config.apexApp === "landing-app") return content;

  const marker = "__NRB_SELECTED_SITE_APEX__";
  const siteHostname = `site-app.${config.domain}`;
  const landingHostname = `landing-app.${config.domain}`;
  const escapedDomain = config.domain.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return content
    .replace(/^PRIMARY_APP=landing-app$/gmu, "PRIMARY_APP=site-app")
    .split(siteHostname)
    .join(marker)
    .replace(new RegExp(`(?<![@\\w.-])${escapedDomain}(?![\\w.-])`, "gu"), landingHostname)
    .split(marker)
    .join(config.domain);
}

// ---------------------------------------------------------------------------
// Main — delegates writes to shared apply engine
// ---------------------------------------------------------------------------

function runInitProject(argv: string[]): void {
  const args = parseArgs(argv);

  if (args.help) {
    console.log(`Usage: pnpm nrb init --name "Acme App" --domain acme.example [options]

Required:
  --name <title>       Product display name.
  --domain <base>      Product-owned DNS base without protocol/path/wildcard.

Options:
  --package-name <id>  Root package name (defaults to slugified title).
  --app-slug <id>      Application slug (defaults to package name/title).
  --db-name <name>     PostgreSQL database name (defaults to snake_case title).
  --owner <org>        GitHub/GitLab owner replacing your-github-org.
  --apex-app <id>      Public apex owner: landing-app (default) or site-app.
  --dry-run            Print the file plan without writing.
  --force              Allow a dirty or non-Git workspace and overwrite conflicts.
  --non-interactive    Compatibility flag; all required values must still be supplied.

Compatibility alias: pnpm init:project -- --name ... --domain ...`);
    process.exit(0);
  }

  // Git dirty-tree guard — unchanged from original
  const ROOT = process.cwd();
  let worktreeStatus: string = "";
  try {
    worktreeStatus = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    });
  } catch (error) {
    console.warn(
      `Warning: unable to determine git worktree status (${error instanceof Error ? error.message : String(error)}); cannot verify a clean worktree.`,
    );
    if (!args.force)
      throw new Error(
        "Refusing to initialize because the git worktree status is unknown. Run inside a git checkout or pass --force.",
      );
  }
  if (worktreeStatus !== undefined && worktreeStatus.trim() && !args.force)
    throw new Error(
      "Refusing to initialize with a dirty worktree. Commit/stash changes or pass --force.",
    );

  const c = buildConfig(args);
  const reps = buildReplacements(c);
  const changes = buildOperations(ROOT, reps, c);

  if (!args.dryRun) {
    // Build setup operations for each change
    const operations: SetupOperation[] = [];
    for (const change of changes) {
      // For existing files we use update_file
      operations.push(updateFile(change.path, change.after, `Replace ${change.path}`));
    }

    // Also update root package.json name
    const pkgPath = join(ROOT, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      pkg.name = c.packageName;
      const pkgContent = `${JSON.stringify(pkg, null, 2)}\n`;
      operations.push(
        updateFile("package.json", pkgContent, "Update root package.json name"),
      );
    }

    // Apply through shared engine
    const fs = createNodeFilesystem(ROOT);
    const applyOptions: ApplyOptions = { force: args.force, dryRun: false };
    apply(operations, fs, applyOptions).then((result) => {
      if (result.failed > 0) {
        process.stderr.write(
          `Apply failed: ${result.applied} applied, ${result.failed} failed\n`,
        );
        if (result.rollbackError) {
          process.stderr.write(`Rollback: ${result.rollbackError}\n`);
        }
        process.exit(1);
      }
      printResult(args, c, changes);
    });
  } else {
    printResult(args, c, changes);
  }
}

function printResult(
  args: InitProjectArgs,
  c: InitConfig,
  changes: Array<{ path: string; after: string }>,
): void {
  console.log(
    JSON.stringify(
      {
        status: args.dryRun ? "dry-run" : "updated",
        config: c,
        filesChanged: changes.length,
        files: changes.slice(0, 50).map((x) => x.path),
      },
      null,
      2,
    ),
  );
}

// Run
runInitProject(process.argv.slice(2));
