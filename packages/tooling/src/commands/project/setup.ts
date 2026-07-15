/**
 * Setup command — interactive and non-interactive boilerplate configuration.
 *
 * Usage:
 *   pnpm nrb setup                        # interactive wizard
 *   pnpm nrb setup --preset fullstack     # preset-based, non-interactive
 *   pnpm nrb setup --config path.json     # config file
 *   pnpm nrb setup --dry-run              # show plan only
 *   pnpm nrb setup --prune                # remove orphaned files
 *   pnpm nrb setup --force                # overwrite conflicts
 *   pnpm nrb setup --non-interactive      # CI mode; first run needs a selection
 *   pnpm nrb setup --json                 # output plan as JSON
 *
 * Routes through the shared setup engine (schema → planner → apply).
 * No direct file writes in this command.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CommandContext } from "../../cli.js";
import { parseNrbConfig, schemaVersion, type NrbConfig, type PresetId } from "../../setup/schema.js";
import { plan } from "../../setup/planner.js";
import { apply, type ApplyOptions } from "../../setup/apply.js";
import { createNodeFilesystem } from "../../setup/adapters/node-filesystem.js";
import { emptyState, migrateState, type SetupState } from "../../setup/state.js";
import { runPrompts, buildConfig, formatConfigSummary, formatPlanSummary } from "../../setup/prompts.js";
import { appCatalog, capabilityCatalog } from "../../setup/catalog.js";
import { materializeSelection, updateSelection } from "../../setup/selection.js";

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

export interface SetupArgs {
  preset?: PresetId;
  config?: string;
  dryRun: boolean;
  prune: boolean;
  force: boolean;
  nonInteractive: boolean;
  json: boolean;
  help: boolean;
  list: boolean;
  replace: boolean;
  apps: string[];
  capabilities: string[];
  removeApps: string[];
  removeCapabilities: string[];
}

export function parseArgs(argv: string[]): SetupArgs {
  const result: SetupArgs = {
    dryRun: false,
    prune: false,
    force: false,
    nonInteractive: false,
    json: false,
    help: false,
    list: false,
    replace: false,
    apps: [],
    capabilities: [],
    removeApps: [],
    removeCapabilities: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
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
    if (arg === "--prune") {
      result.prune = true;
      continue;
    }
    if (arg === "--force") {
      result.force = true;
      continue;
    }
    if (arg === "--non-interactive") {
      result.nonInteractive = true;
      continue;
    }
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "--list") {
      result.list = true;
      continue;
    }
    if (arg === "--replace") {
      result.replace = true;
      continue;
    }

    if (arg === "--preset") {
      result.preset = requireOptionValue(argv, ++i, "--preset") as PresetId;
      continue;
    }
    if (arg.startsWith("--preset=")) {
      result.preset = requireInlineValue(arg, "--preset") as PresetId;
      continue;
    }

    if (arg === "--config") {
      result.config = requireOptionValue(argv, ++i, "--config");
      continue;
    }
    if (arg.startsWith("--config=")) {
      result.config = requireInlineValue(arg, "--config");
      continue;
    }

    if (arg === "--app") {
      result.apps.push(requireOptionValue(argv, ++i, "--app"));
      continue;
    }
    if (arg.startsWith("--app=")) {
      result.apps.push(requireInlineValue(arg, "--app"));
      continue;
    }

    if (arg === "--capability") {
      result.capabilities.push(requireOptionValue(argv, ++i, "--capability"));
      continue;
    }
    if (arg.startsWith("--capability=")) {
      result.capabilities.push(requireInlineValue(arg, "--capability"));
      continue;
    }

    if (arg === "--remove-app") {
      result.removeApps.push(requireOptionValue(argv, ++i, "--remove-app"));
      continue;
    }
    if (arg.startsWith("--remove-app=")) {
      result.removeApps.push(requireInlineValue(arg, "--remove-app"));
      continue;
    }

    if (arg === "--remove-capability") {
      result.removeCapabilities.push(requireOptionValue(argv, ++i, "--remove-capability"));
      continue;
    }
    if (arg.startsWith("--remove-capability=")) {
      result.removeCapabilities.push(requireInlineValue(arg, "--remove-capability"));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
}

function requireOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function requireInlineValue(argument: string, option: string): string {
  const value = argument.slice(`${option}=`.length);
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadConfigFromPath(path: string): NrbConfig {
  const content = readFileSync(path, "utf8");
  return parseNrbConfig(JSON.parse(content));
}

function loadExistingConfig(workspaceRoot: string): NrbConfig | null {
  const configPath = join(workspaceRoot, "nrb.config.json");
  if (!existsSync(configPath)) return null;
  return loadConfigFromPath(configPath);
}

function loadState(workspaceRoot: string): SetupState {
  const statePath = join(workspaceRoot, ".nrb", "state.json");
  if (!existsSync(statePath)) return emptyState;
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    return migrateState(raw);
  } catch {
    return emptyState;
  }
}

function saveState(workspaceRoot: string, state: SetupState): void {
  const stateDir = join(workspaceRoot, ".nrb");
  if (!existsSync(stateDir)) {
    // Create if needed — apply will handle this via the adapter.
  }
  // State is written by the apply step; we save a final version here.
  const statePath = join(stateDir, "state.json");
  if (!existsSync(stateDir)) {
    // We'll rely on the filesystem adapter to create .nrb directory.
    // But for the state.json backup, we write directly.
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function runSetupCommand(context: CommandContext): Promise<number> {
  let args: SetupArgs;
  try {
    args = parseArgs(context.argv);
  } catch (err: unknown) {
    return reportConfigurationError(err, context.argv.includes("--json"));
  }

  if (args.help) {
    printUsage();
    return 0;
  }

  const { workspaceRoot } = context;

  if (args.list) {
    try {
      assertListOnly(args);
      printSelectionCatalog(loadExistingConfig(workspaceRoot), args.json);
      return 0;
    } catch (err: unknown) {
      return reportConfigurationError(err, args.json);
    }
  }

  let config: NrbConfig;
  try {
    config = buildConfigFromArgs(args, workspaceRoot);
  } catch (err: unknown) {
    return reportConfigurationError(err, args.json);
  }

  return executeSetup(context, args, config);
}

async function executeSetup(context: CommandContext, args: SetupArgs, config: NrbConfig): Promise<number> {
  const { workspaceRoot } = context;

  const currentState = loadState(workspaceRoot);

  let planResult: ReturnType<typeof plan>;
  try {
    planResult = plan(config, currentState);
  } catch (err: unknown) {
    return reportConfigurationError(err, args.json);
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          config,
          configHash: planResult.configHash,
          operations: planResult.operations,
          prunableFiles: planResult.prunableFiles,
          summary: planResult.summary,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  // Show summary
  if (planResult.operations.length === 0) {
    process.stdout.write("✓ Workspace is already up to date.\n");
    return 0;
  }

  process.stdout.write(formatConfigSummary(config) + "\n\n");
  process.stdout.write(formatPlanSummary(planResult.operations, planResult.configHash) + "\n\n");

  // Dry run — show plan and exit
  if (config.options.dryRun || args.dryRun) {
    process.stdout.write("Dry run — no files were modified.\n");
    return 0;
  }

  // Apply
  const fs = createNodeFilesystem(workspaceRoot);
  const applyOptions: ApplyOptions = {
    force: config.options.force || args.force,
    dryRun: false,
    stateFiles: currentState.files,
  };

  const result = await apply(planResult.operations, fs, applyOptions);

  if (result.failed > 0) {
    process.stderr.write(`Apply failed: ${result.applied} applied, ${result.failed} failed\n`);
    if (result.rollbackError) {
      process.stderr.write(`Rollback: ${result.rollbackError}\n`);
    }
    return 1;
  }

  // Save state
  saveState(workspaceRoot, planResult.expectedState);

  process.stdout.write(`✓ Setup complete: ${result.applied} operations applied, ${result.skipped} skipped.\n`);
  return 0;
}

/** Build a config from exact or additive CLI selection input. */
export function buildConfigFromArgs(args: SetupArgs, workspaceRoot: string): NrbConfig {
  const hasSelectionUpdate =
    args.preset !== undefined ||
    args.apps.length > 0 ||
    args.capabilities.length > 0 ||
    args.removeApps.length > 0 ||
    args.removeCapabilities.length > 0 ||
    args.replace;

  if (args.config) {
    if (hasSelectionUpdate) {
      throw new Error("--config is an exact configuration source and cannot be combined with selection flags.");
    }
    const resolvedPath = args.config.startsWith("/") ? args.config : resolve(workspaceRoot, args.config);
    return loadConfigFromPath(resolvedPath);
  }

  const existing = loadExistingConfig(workspaceRoot);
  if (hasSelectionUpdate) {
    if (!existing && (args.removeApps.length > 0 || args.removeCapabilities.length > 0)) {
      throw new Error("Cannot remove selections before setup has created nrb.config.json.");
    }
    return updateSelection(existing, {
      preset: args.preset,
      addApps: args.apps,
      addCapabilities: args.capabilities,
      removeApps: args.removeApps,
      removeCapabilities: args.removeCapabilities,
      replace: args.replace,
      options: {
        prune: args.prune,
        force: args.force,
        dryRun: args.dryRun,
        nonInteractive: args.nonInteractive,
      },
    });
  }

  if (existing) {
    return parseNrbConfig({
      ...existing,
      options: {
        ...existing.options,
        prune: args.prune || existing.options.prune,
        force: args.force || existing.options.force,
        dryRun: args.dryRun || existing.options.dryRun,
        nonInteractive: args.nonInteractive,
      },
    });
  }

  throw new Error("No applications selected. Run `pnpm nrb setup` interactively or pass --preset, --app, or --config.");
}

// ---------------------------------------------------------------------------
// Interactive entry — wraps runSetupCommand with prompt flow
// ---------------------------------------------------------------------------

export async function runSetupCommandInteractive(
  context: CommandContext,
  promptRunner: typeof runPrompts = runPrompts,
): Promise<number> {
  let args: SetupArgs;
  try {
    args = parseArgs(context.argv);
  } catch (err: unknown) {
    return reportConfigurationError(err, context.argv.includes("--json"));
  }

  if (args.help) {
    printUsage();
    return 0;
  }

  try {
    const existing = loadExistingConfig(context.workspaceRoot);
    const prompts = await promptRunner(false, existing);
    const config = buildConfig(prompts, {
      options: {
        prune: args.prune || prompts.prune,
        force: args.force || prompts.force,
        dryRun: args.dryRun || prompts.dryRun,
        nonInteractive: false,
      },
    });
    return executeSetup(context, args, parseNrbConfig(config));
  } catch (err: unknown) {
    return reportConfigurationError(err, args.json);
  }
}

/** Entry point for CLI registration. */
export async function runSetupFromContext(context: CommandContext): Promise<number> {
  // Check if interactive mode is needed
  let args: SetupArgs;
  try {
    args = parseArgs(context.argv);
  } catch (err: unknown) {
    return reportConfigurationError(err, context.argv.includes("--json"));
  }

  const hasDirectSelection =
    args.preset !== undefined ||
    args.config !== undefined ||
    args.apps.length > 0 ||
    args.capabilities.length > 0 ||
    args.removeApps.length > 0 ||
    args.removeCapabilities.length > 0 ||
    args.replace ||
    args.list;

  if (!args.nonInteractive && !hasDirectSelection) {
    // Check if stdin is a TTY for interactive mode
    if (process.stdin.isTTY) {
      return runSetupCommandInteractive(context);
    }
  }

  return runSetupCommand(context);
}

function assertListOnly(args: SetupArgs): void {
  const combined =
    args.config !== undefined ||
    args.preset !== undefined ||
    args.apps.length > 0 ||
    args.capabilities.length > 0 ||
    args.removeApps.length > 0 ||
    args.removeCapabilities.length > 0 ||
    args.replace ||
    args.prune ||
    args.force ||
    args.dryRun;
  if (combined) throw new Error("--list can only be combined with --json or --non-interactive.");
}

function printSelectionCatalog(existing: NrbConfig | null, json: boolean): void {
  const selected = existing ? materializeSelection(existing) : { apps: [], capabilities: [] };
  const selectedApps = new Set(selected.apps);
  const selectedCapabilities = new Set(selected.capabilities);
  const applications = Object.values(appCatalog).map((app) => ({
    id: app.id,
    label: app.label,
    platform: app.platform,
    classification: app.classification,
    selected: selectedApps.has(app.id),
  }));
  const capabilities = Object.values(capabilityCatalog).map((capability) => ({
    id: capability.id,
    label: capability.label,
    selected: selectedCapabilities.has(capability.id),
  }));

  if (json) {
    process.stdout.write(`${JSON.stringify({ configured: existing !== null, applications, capabilities }, null, 2)}\n`);
    return;
  }

  process.stdout.write(existing ? "Current workspace selection:\n" : "No workspace selection yet.\n");
  const groups = [
    {
      label: "frontend applications",
      matches: (app: (typeof applications)[number]) =>
        app.classification === "reference" && app.platform === "frontend",
    },
    {
      label: "backend APIs",
      matches: (app: (typeof applications)[number]) =>
        app.classification === "reference" && app.platform === "backend",
    },
    {
      label: "full-stack E2E",
      matches: (app: (typeof applications)[number]) =>
        app.classification === "reference" && app.platform === "e2e",
    },
    {
      label: "optional integration APIs",
      matches: (app: (typeof applications)[number]) => app.classification === "optional",
    },
  ];
  for (const group of groups) {
    process.stdout.write(`\n${group.label}:\n`);
    for (const app of applications.filter(group.matches)) {
      process.stdout.write(`  ${app.selected ? "[x]" : "[ ]"} ${app.id} — ${app.label}\n`);
    }
  }
  process.stdout.write("\ncapabilities:\n");
  for (const capability of capabilities) {
    process.stdout.write(`  ${capability.selected ? "[x]" : "[ ]"} ${capability.id} — ${capability.label}\n`);
  }
  process.stdout.write(
    "\nRerun `pnpm nrb setup` to edit interactively, or use `--app <id>` / `--remove-app <id>` for scripted updates.\n",
  );
}

function reportConfigurationError(err: unknown, json: boolean): number {
  const msg = errorMessage(err);
  process.stderr.write(`Configuration error: ${msg}\n`);
  if (json) process.stdout.write(`${JSON.stringify({ error: msg, code: 1 }, null, 2)}\n`);
  return 1;
}

function printUsage(): void {
  process.stdout.write(
    `Usage: pnpm nrb setup [options]

Interactive and non-interactive boilerplate configuration.

Options:
  --preset <name>            Select a profile (minimal, web, fullstack, enterprise, bots)
  --config <path>            Load configuration from a JSON file
  --app <id>                 Add an application to the current selection (repeatable)
  --capability <id>          Add a capability to the current selection (repeatable)
  --remove-app <id>          Remove an application when no selected app requires it
  --remove-capability <id>   Remove a capability when no selection requires it
  --replace                  Replace the current selection with explicit --app/--capability values
  --list                     List available applications and current selection
  --dry-run                  Show the plan without applying changes
  --prune                    Remove files no longer needed by the configuration
  --force                    Overwrite conflicting files without refusing
  --non-interactive          Never prompt; an explicit selection is required on first run
  --json                     Output the plan as JSON
  -h, --help                 Show this help

Examples:
  pnpm nrb setup                                  # interactive wizard
  pnpm nrb setup --list                           # inspect available/current apps
  pnpm nrb setup --app mobile-app --non-interactive # add mobile later, preserving current apps
  pnpm nrb setup --remove-app landing-app --non-interactive # remove an optional app
  pnpm nrb setup --replace --app landing-app --non-interactive # exact custom selection
  pnpm nrb setup --preset fullstack --dry-run     # preview fullstack preset
  pnpm nrb setup --config nrb.config.json         # apply from config file
  pnpm nrb setup --non-interactive --preset fullstack # complete core monorepo\n`,
  );
}

/** Extract a safe error message from any thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}
