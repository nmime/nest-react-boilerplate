/**
 * `pnpm nrb add` command — add an app, library, or feature to the workspace.
 *
 * Usage:
 *   pnpm nrb add app <name> --kind <kind> --renderer <renderer>
 *   pnpm nrb add lib <name> --kind <kind> --type <type> --scope <scope>
 *   pnpm nrb add feature <name> --api-app <name> --frontend-app <name>
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
  apiApp?: string;
  frontendApp?: string;
  entityKind?: "frontend" | "backend" | "common";
  renderer?: "vite" | "astro" | "vike" | "expo" | "nest-api" | "worker";
  libraryType?: string;
  scope?: string;
  /** Extra arguments forwarded to the underlying generator. */
  extra: string[];
}

export function parseAddArgs(argv: string[]): AddArgs {
  const result: AddArgs = {
    help: false,
    dryRun: false,
    force: false,
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
      result.apiApp = argv[++i];
      continue;
    }
    if (arg.startsWith("--api-app=")) {
      result.apiApp = arg.slice("--api-app=".length);
      continue;
    }
    if (arg === "--frontend-app") {
      result.frontendApp = argv[++i];
      continue;
    }
    if (arg.startsWith("--frontend-app=")) {
      result.frontendApp = arg.slice("--frontend-app=".length);
      continue;
    }
    if (arg === "--kind") {
      result.entityKind = argv[++i] as AddArgs["entityKind"];
      continue;
    }
    if (arg.startsWith("--kind=")) {
      result.entityKind = arg.slice("--kind=".length) as AddArgs["entityKind"];
      continue;
    }
    if (arg === "--renderer") {
      result.renderer = argv[++i] as AddArgs["renderer"];
      continue;
    }
    if (arg.startsWith("--renderer=")) {
      result.renderer = arg.slice("--renderer=".length) as AddArgs["renderer"];
      continue;
    }
    if (arg === "--type") {
      result.libraryType = argv[++i];
      continue;
    }
    if (arg.startsWith("--type=")) {
      result.libraryType = arg.slice("--type=".length);
      continue;
    }
    if (arg === "--scope") {
      result.scope = argv[++i];
      continue;
    }
    if (arg.startsWith("--scope=")) {
      result.scope = arg.slice("--scope=".length);
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
 * The main handler for `pnpm nrb add`.  Resolves the sub-command and delegates to
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

  if ((args.kind === "app" || args.kind === "lib") && !args.entityKind) {
    process.stderr.write(`Error: add ${args.kind} requires --kind (${args.kind === "app" ? "frontend | backend" : "frontend | backend | common"})\n`);
    return 1;
  }

  if (args.kind === "lib" && !args.libraryType) {
    process.stderr.write(
      "Error: add lib requires --type (common | util | ui | sdk | feature-main | feature-shared | data-access | test-util | asset)\n",
    );
    return 1;
  }

  if (args.kind === "feature" && (!args.apiApp || !args.frontendApp)) {
    process.stderr.write(
      "Error: add feature requires explicit --api-app and --frontend-app owners; this monorepo has no default application.\n",
    );
    return 1;
  }

  if (args.kind === "app" && !args.renderer) {
    process.stderr.write(
      `Error: ${args.entityKind} applications require --renderer (${args.entityKind === "frontend" ? "vite | astro | vike | expo" : "nest-api | worker"})\n`,
    );
    return 1;
  }

  if (args.kind === "app" && args.entityKind === "backend" && args.renderer && !["nest-api", "worker"].includes(args.renderer)) {
    process.stderr.write('Error: backend applications support --renderer "nest-api" or "worker"\n');
    return 1;
  }

  if (args.force && args.kind !== "feature") {
    process.stderr.write("Error: --force is supported only for feature regeneration; app and library roots are never overwritten.\n");
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
  if (args.apiApp) genArgs.push(`--apiApp=${args.apiApp}`);
  if (args.frontendApp) genArgs.push(`--frontendApp=${args.frontendApp}`);
  if (args.entityKind) genArgs.push(`--kind=${args.entityKind}`);
  if (args.renderer) genArgs.push(`--renderer=${args.renderer}`);
  if (args.libraryType) genArgs.push(`--type=${args.libraryType}`);
  if (args.scope) genArgs.push(`--scope=${args.scope}`);
  for (const e of args.extra) genArgs.push(e);

  const kindLabel = args.kind!;
  process.stdout.write(`add ${kindLabel}: running Nx generator ${generatorName} --name=${name}\n`);

  const result = runner({
    collectionGenerator: generatorName,
    generatorArgs: genArgs,
    cwd: workspaceRoot,
  });

  if (result.success) {
    if (result.stdout.trim().length > 0) {
      process.stdout.write(`${result.stdout.trimEnd()}\n`);
    }
    process.stdout.write(`✓ ${kindLabel} "${name}" added (Nx generator exited 0).\n`);
    return 0;
  }
  const details = [result.stdout, result.stderr].filter((value) => value.trim().length > 0).join("\n");
  process.stderr.write(`Nx generator failed (exit ${result.exitCode}):\n${details}\n`);
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
  process.stdout.write(`Usage: pnpm nrb add <kind> <name> [options]

Kind:
  app <name>    Generate a renderer-aware application via @repo/tooling:application.
  lib <name>    Generate a boundary-aware library via @repo/tooling:library.
  feature <name> Scaffold a vertical feature slice via @repo/tooling:feature
                  (shared DTOs, Nest module, PostgreSQL infrastructure, frontend page).

Options:
  --dry-run             Show what would be done without making changes.
  --force               Regenerate an existing feature; never overwrites app/lib roots.
  --api-app <name>      Required API application that owns a feature.
  --frontend-app <name> Required frontend application that hosts a feature.
  --kind <kind>         App/lib platform: frontend, backend, or common.
  --renderer <renderer> App runtime: vite, astro, vike, expo, nest-api, or worker.
  --type <type>         Semantic library type (common, util, ui, sdk, feature-main,
                        feature-shared, data-access, test-util, or asset).
  --scope <scope>       Nx ownership scope tag for a library.
  --help, -h            Show this help message.
  ...                   Additional arguments forwarded to the Nx generator.

Examples:
  pnpm nrb add app payments-api --kind backend --renderer nest-api
  pnpm nrb add app portal --kind frontend --renderer vite
  pnpm nrb add lib currency --kind common --type util --scope shared
  pnpm nrb add feature invoices --api-app user-app-api --frontend-app user-app
  pnpm nrb add feature billing --api-app admin-app-api --frontend-app admin-app --dry-run\n`);
}
