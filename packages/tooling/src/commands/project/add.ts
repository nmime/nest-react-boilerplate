/**
 * `nrb add` command — add an app, library, or feature to the workspace.
 *
 * Usage:
 *   nrb add app <name>           # invoke Nx @repo/tooling:application generator
 *   nrb add lib <name>           # invoke Nx @repo/tooling:library generator
 *   nrb add feature <name>       # invoke Nx @repo/tooling:feature generator
 *
 * All branches call a mockable Nx generator runner (for testability).
 */
import type { CommandContext } from "../../cli.js";
import { createNxGeneratorRunner, type NxGeneratorFn, type NxGeneratorResult } from "./nx-generator-runner.js";

// ---------------------------------------------------------------------------
// Argument parser for `add`
// ---------------------------------------------------------------------------

interface AddArgs {
  /** app | lib | feature */
  kind?: "app" | "lib" | "feature";
  /** Name of the entity being added. */
  name?: string;
  help: boolean;
  dryRun: boolean;
  force: boolean;
  apiApp: string;
  /** Extra arguments forwarded to the underlying generator. */
  extra: string[];
}

export function parseAddArgs(argv: string[]): AddArgs {
  const result: AddArgs = {
    help: false,
    dryRun: false,
    force: false,
    apiApp: "user-app-api",
    extra: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      result.extra.push(...argv.slice(i + 1));
      break;
    }

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      result.force = true;
      continue;
    }

    if (arg === "--api-app") {
      result.apiApp = argv[++i] ?? result.apiApp;
      continue;
    }
    if (arg.startsWith("--api-app=")) {
      result.apiApp = arg.slice("--api-app=".length);
      continue;
    }

    // First positional that is a known kind
    if (!result.kind && (arg === "app" || arg === "lib" || arg === "feature")) {
      result.kind = arg as "app" | "lib" | "feature";
      continue;
    }

    // Second positional is the name
    if (!result.name && !arg.startsWith("-")) {
      result.name = arg;
      continue;
    }

    // Everything else is extra
    result.extra.push(arg);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Generator name map — matches generators.json keys
// ---------------------------------------------------------------------------

const GENERATOR_MAP: Record<string, string> = {
  app: "@repo/tooling:application",
  lib: "@repo/tooling:library",
  feature: "@repo/tooling:feature",
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * The main handler for `nrb add`.  Resolves the sub-command and delegates to
 * the corresponding Nx generator from `@repo/tooling`:
 *
 * - `app <name>`   → @repo/tooling:application
 * - `lib <name>`   → @repo/tooling:library
 * - `feature <name>` → @repo/tooling:feature
 * - (no args / unknown kind) → usage / exit 1
 */
export async function runAddCommand(
  context: CommandContext,
  runner: NxGeneratorFn = createNxGeneratorRunner(),
): Promise<number> {
  const args = parseAddArgs(context.argv);

  if (args.help) {
    printAddUsage();
    return 0;
  }

  if (!args.kind) {
    process.stderr.write("Error: missing <kind> (app | lib | feature)\n\n");
    printAddUsage();
    return 1;
  }

  if (!args.name) {
    process.stderr.write(`Error: missing <name> for add ${args.kind}\n\n`);
    printAddUsage();
    return 1;
  }

  const generatorName = GENERATOR_MAP[args.kind];
  if (!generatorName) {
    process.stderr.write(`Error: unknown add kind "${args.kind}". Expected app, lib, or feature.\n`);
    return 1;
  }

  return runAddWithNx(args, context.workspaceRoot, generatorName, runner);
}

// ---------------------------------------------------------------------------
// Shared Nx dispatch
// ---------------------------------------------------------------------------

function runAddWithNx(
  args: AddArgs,
  workspaceRoot: string,
  generatorName: string,
  runner: NxGeneratorFn,
): NxGeneratorResult["exitCode"] {
  const name = args.name!;
  const genArgs = [`--name=${name}`];

  if (args.dryRun) genArgs.push("--dryRun=true");
  if (args.force) genArgs.push("--force=true");
  if (args.apiApp !== "user-app-api") genArgs.push(`--apiApp=${args.apiApp}`);
  for (const e of args.extra) genArgs.push(e);

  const kindLabel = args.kind!;
  process.stdout.write(`add ${kindLabel}: running Nx generator ${generatorName} --name=${name}\n`);

  const result = runner({
    collectionGenerator: generatorName,
    generatorArgs: genArgs,
    cwd: workspaceRoot,
  });

  if (result.success) {
    process.stdout.write(`✓ ${kindLabel} "${name}" added (Nx generator exited 0).\n`);
    return 0;
  }
  process.stderr.write(`Nx generator failed (exit ${result.exitCode}):\n${result.stderr}\n`);
  return result.exitCode;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runAddFromContext(context: CommandContext): Promise<number> {
  return runAddCommand(context);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printAddUsage(): void {
  process.stdout.write(`Usage: nrb add <kind> <name> [options]

Kind:
  app <name>    Generate a new application via @repo/tooling:application.
  lib <name>    Generate a new library via @repo/tooling:library.
  feature <name> Scaffold a vertical feature slice via @repo/tooling:feature
                  (shared DTOs, Nest module, PostgreSQL infrastructure, frontend page).

Options:
  --dry-run             Show what would be done without making changes.
  --force               Overwrite existing files without refusing.
  --api-app <name>      Target API app (for feature; default: user-app-api).
  --help, -h            Show this help message.
  ...                   Additional arguments forwarded to the Nx generator.

Examples:
  nrb add app payments
  nrb add lib shared-utils
  nrb add feature invoices --api-app user-app-api
  nrb add feature billing --dry-run`);
}
