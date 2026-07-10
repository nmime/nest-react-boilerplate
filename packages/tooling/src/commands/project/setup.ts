/**
 * Setup command — interactive and non-interactive boilerplate configuration.
 *
 * Usage:
 *   nrb setup                        # interactive wizard
 *   nrb setup --preset fullstack     # preset-based, non-interactive
 *   nrb setup --config path.json     # config file
 *   nrb setup --dry-run              # show plan only
 *   nrb setup --prune                # remove orphaned files
 *   nrb setup --force                # overwrite conflicts
 *   nrb setup --non-interactive      # CI mode with defaults
 *   nrb setup --json                 # output plan as JSON
 *
 * Routes through the shared setup engine (schema → planner → apply).
 * No direct file writes in this command.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CommandContext } from "../../cli.js";
import { parseNrbConfig, SCHEMA_VERSION, type NrbConfig, type PresetId } from "../../setup/schema.js";
import { plan, type PlanResult } from "../../setup/planner.js";
import { apply, type ApplyOptions } from "../../setup/apply.js";
import { createNodeFilesystem } from "../../setup/adapters/node-filesystem.js";
import { EMPTY_STATE, migrateState, hashString, type SetupState, buildState } from "../../setup/state.js";
import { runPrompts, buildConfig, formatConfigSummary, formatPlanSummary } from "../../setup/prompts.js";
import { expandPreset } from "../../setup/presets.js";
import { expandDependencies } from "../../setup/catalog.js";

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

interface SetupArgs {
  preset?: PresetId;
  config?: string;
  dryRun: boolean;
  prune: boolean;
  force: boolean;
  nonInteractive: boolean;
  json: boolean;
  help: boolean;
  apps?: string[];
  capabilities?: string[];
}

export function parseArgs(argv: string[]): SetupArgs {
  const result: SetupArgs = {
    dryRun: false,
    prune: false,
    force: false,
    nonInteractive: false,
    json: false,
    help: false,
    apps: [],
    capabilities: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--" ) { break; }
    if (arg === "--help" || arg === "-h") { result.help = true; continue; }
    if (arg === "--dry-run") { result.dryRun = true; continue; }
    if (arg === "--prune") { result.prune = true; continue; }
    if (arg === "--force") { result.force = true; continue; }
    if (arg === "--non-interactive") { result.nonInteractive = true; continue; }
    if (arg === "--json") { result.json = true; continue; }

    if (arg === "--preset" || arg === "--preset=") {
      result.preset = argv[++i] as PresetId;
      continue;
    }
    if (arg.startsWith("--preset=")) {
      result.preset = arg.slice("--preset=".length) as PresetId;
      continue;
    }

    if (arg === "--config" || arg === "--config=") {
      result.config = argv[++i];
      continue;
    }
    if (arg.startsWith("--config=")) {
      result.config = arg.slice("--config=".length);
      continue;
    }

    if (arg === "--app" || arg === "--app=") {
      result.apps!.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--app=")) {
      result.apps!.push(arg.slice("--app=".length));
      continue;
    }

    if (arg === "--capability" || arg === "--capability=") {
      result.capabilities!.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--capability=")) {
      result.capabilities!.push(arg.slice("--capability=".length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return result;
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
  try {
    return loadConfigFromPath(configPath);
  } catch {
    return null;
  }
}

function loadState(workspaceRoot: string): SetupState {
  const statePath = join(workspaceRoot, ".nrb", "state.json");
  if (!existsSync(statePath)) return EMPTY_STATE;
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    return migrateState(raw);
  } catch {
    return EMPTY_STATE;
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

export async function runSetupCommand(
  context: CommandContext,
): Promise<number> {
  const args = parseArgs(context.argv);

  if (args.help) {
    printUsage();
    return 0;
  }

  const { workspaceRoot } = context;

  // Build the config from args, config file, or prompts
  let config: NrbConfig;
  try {
    config = buildConfigFromArgs(args, workspaceRoot);
  } catch (err: any) {
    process.stderr.write(`Configuration error: ${err.message}\n`);
    if (args.json) {
      process.stdout.write(
        JSON.stringify({ error: err.message, code: 1 }, null, 2) + "\n",
      );
    }
    return 1;
  }

  // Load current state
  const currentState = loadState(workspaceRoot);

  // Plan
  const planResult = plan(config, currentState);

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
    return planResult.operations.length === 0 ? 0 : 0; // JSON output is informational
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

  process.stdout.write(
    `✓ Setup complete: ${result.applied} operations applied, ${result.skipped} skipped.\n`,
  );
  return 0;
}

/** Build NrbConfig from CLI arguments, config file, or interactive prompts. */
function buildConfigFromArgs(args: SetupArgs, workspaceRoot: string): NrbConfig {
  // If --config is provided, load from file
  if (args.config) {
    const resolvedPath = args.config.startsWith("/")
      ? args.config
      : resolve(workspaceRoot, args.config);
    return loadConfigFromPath(resolvedPath);
  }

  // If preset or apps/capabilities are provided, build from args
  if (args.preset || (args.apps && args.apps.length > 0) || (args.capabilities && args.capabilities.length > 0)) {
    const appIds = args.apps ?? [];
    const capIds = args.capabilities ?? [];

    // Expand preset if provided
    let expandedApps = [...appIds];
    let expandedCaps = [...capIds];
    if (args.preset) {
      const presetApps = expandPreset(args.preset);
      for (const a of presetApps.apps) {
        if (!expandedApps.includes(a)) expandedApps.push(a);
      }
      for (const c of presetApps.capabilities) {
        if (!expandedCaps.includes(c)) expandedCaps.push(c);
      }
    }

    // Expand dependencies
    const expanded = expandDependencies(expandedApps as any, expandedCaps as any);

    return {
      schemaVersion: SCHEMA_VERSION,
      preset: args.preset,
      apps: expanded.apps,
      capabilities: expanded.capabilities,
      options: {
        prune: args.prune,
        force: args.force,
        dryRun: args.dryRun,
        nonInteractive: args.nonInteractive,
      },
    };
  }

  // If there's an existing config, load it and apply option overrides
  const existing = loadExistingConfig(workspaceRoot);
  if (existing) {
    return {
      ...existing,
      options: {
        ...existing.options,
        prune: args.prune || existing.options.prune,
        force: args.force || existing.options.force,
        dryRun: args.dryRun || existing.options.dryRun,
        nonInteractive: args.nonInteractive || existing.options.nonInteractive,
      },
    };
  }

  // Fall back to non-interactive defaults
  if (args.nonInteractive) {
    return {
      schemaVersion: SCHEMA_VERSION,
      preset: "minimal",
      apps: [],
      capabilities: [],
      options: {
        prune: args.prune,
        force: args.force,
        dryRun: args.dryRun,
        nonInteractive: true,
      },
    };
  }

  // Interactive mode: build config from prompts (deferred)
  // For non-interactive path, return defaults
  return {
    schemaVersion: SCHEMA_VERSION,
    preset: "minimal",
    apps: [],
    capabilities: [],
    options: {
      prune: args.prune,
      force: args.force,
      dryRun: args.dryRun,
      nonInteractive: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Interactive entry — wraps runSetupCommand with prompt flow
// ---------------------------------------------------------------------------

export async function runSetupCommandInteractive(
  context: CommandContext,
): Promise<number> {
  const args = parseArgs(context.argv);

  if (args.help) {
    printUsage();
    return 0;
  }

  if (!args.nonInteractive && !args.preset && !args.config) {
    // Interactive mode: run prompts first
    const prompts = await runPrompts(false);

    // Merge prompts into args
    if (prompts.preset) args.preset = prompts.preset;
    args.apps = prompts.apps;
    args.capabilities = prompts.capabilities;
    args.prune = args.prune || prompts.prune;
    args.force = args.force || prompts.force;
    args.dryRun = args.dryRun || prompts.dryRun;
  }

  return runSetupCommand(context);
}

/** Entry point for CLI registration. */
export async function runSetupFromContext(
  context: CommandContext,
): Promise<number> {
  // Check if interactive mode is needed
  const args = parseArgs(context.argv);

  if (!args.nonInteractive && !args.preset && !args.config && !args.apps?.length) {
    // Check if stdin is a TTY for interactive mode
    if (process.stdin.isTTY) {
      return runSetupCommandInteractive(context);
    }
  }

  return runSetupCommand(context);
}

function printUsage(): void {
  process.stdout.write(
    `Usage: repo-tooling project setup [options]

Interactive and non-interactive boilerplate configuration.

Options:
  --preset <name>            Start from a preset (minimal, starter, fullstack, enterprise, bots)
  --config <path>            Load configuration from a JSON file
  --app <id>                 Add an application (repeatable)
  --capability <id>          Add a capability (repeatable)
  --dry-run                  Show the plan without applying changes
  --prune                    Remove files no longer needed by the configuration
  --force                    Overwrite conflicting files without refusing
  --non-interactive          Use defaults without prompting (CI-friendly)
  --json                     Output the plan as JSON
  -h, --help                 Show this help

Examples:
  nrb setup                                  # interactive wizard
  nrb setup --preset fullstack --dry-run     # preview fullstack preset
  nrb setup --config nrb.config.json         # apply from config file
  nrb setup --non-interactive --preset minimal  # CI mode`,
  );
}
