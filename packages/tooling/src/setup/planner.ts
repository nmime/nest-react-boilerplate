/**
 * Deterministic operation planner.
 *
 * Given a validated NrbConfig and the current SetupState, produces a
 * sorted array of SetupOperations that bring the workspace into the
 * desired state.  The planner is pure — it never touches the filesystem.
 *
 * Second-run idempotency: if the config hasn't changed and the state
 * matches, the planner returns an empty operation list.
 *
 * The planner also generates two metadata files:
 *   - `nrb.config.json` — the resolved configuration
 *   - `.nrb/summary.md` — a human-readable summary of the plan
 */
import type { NrbConfig } from "./schema.js";
import type { SetupOperation } from "./operations.js";
import { createFile, sortOperations, deleteFile, updateFile } from "./operations.js";
import type { SetupState } from "./state.js";
import { configHash, hashString, buildState, diffState, EMPTY_STATE } from "./state.js";
import { expandDependencies } from "./catalog.js";
import { expandPreset } from "./presets.js";

// ---------------------------------------------------------------------------
// Plan result
// ---------------------------------------------------------------------------

export interface PlanResult {
  /** Operations to apply (sorted deterministically). */
  operations: SetupOperation[];
  /** The resolved config hash. */
  configHash: string;
  /** The expected state after applying all operations. */
  expectedState: SetupState;
  /** Files that would be pruned (only relevant when prune option is set). */
  prunableFiles: string[];
  /** Summary metadata for summary.md generation. */
  summary: PlanSummary;
}

export interface PlanSummary {
  apps: string[];
  capabilities: string[];
  preset?: string;
  configHash: string;
}

// ---------------------------------------------------------------------------
// File generation — deterministic content for config and summary files.
// ---------------------------------------------------------------------------

/**
 * Generate the nrb.config.json content from the resolved config.
 */
export function generateConfigFile(config: NrbConfig): { path: string; content: string } {
  return {
    path: "nrb.config.json",
    content: JSON.stringify(config, null, 2) + "\n",
  };
}

/**
 * Generate .nrb/summary.md from a plan summary.
 * Content depends only on config-derived data (apps, caps, preset, hash),
 * never on operation counts — this guarantees idempotent second-run.
 */
export function generateSummaryMd(summary: PlanSummary): { path: string; content: string } {
  const lines: string[] = [];

  lines.push("# Setup Plan Summary");
  lines.push("");

  if (summary.preset) {
    lines.push("**Preset:** `" + summary.preset + "`");
    lines.push("");
  }

  lines.push("**Configuration hash:** `" + summary.configHash + "`");
  lines.push("");

  lines.push("## Applications");
  lines.push("");
  if (summary.apps.length === 0) {
    lines.push("*No applications selected.*");
  } else {
    for (const app of summary.apps) {
      lines.push("- " + app);
    }
  }
  lines.push("");

  lines.push("## Capabilities");
  lines.push("");
  if (summary.capabilities.length === 0) {
    lines.push("*No capabilities selected.*");
  } else {
    for (const cap of summary.capabilities) {
      lines.push("- " + cap);
    }
  }
  lines.push("");

  return {
    path: ".nrb/summary.md",
    content: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

/**
 * Build the planner input from a config.
 * Resolves presets, expands dependencies, and returns the final app/capability lists.
 */
export function resolveConfig(config: NrbConfig): {
  apps: string[];
  capabilities: string[];
  preset?: string;
} {
  let apps = [...config.apps];
  let capabilities = [...config.capabilities];

  if (config.preset) {
    const expanded = expandPreset(config.preset);
    for (const a of expanded.apps) {
      if (!apps.includes(a)) apps.push(a);
    }
    for (const c of expanded.capabilities) {
      if (!capabilities.includes(c)) capabilities.push(c);
    }
  }

  // Expand transitive dependencies
  const expanded = expandDependencies(apps as any, capabilities as any);
  return {
    apps: expanded.apps,
    capabilities: expanded.capabilities,
    preset: config.preset,
  };
}

/**
 * Core planner: produces a sorted plan of operations.
 *
 * 1. Resolve the config (preset expansion + dependency resolution).
 * 2. Generate metadata files (nrb.config.json, .nrb/summary.md).
 * 3. Diff against current state to determine create/update/delete.
 * 4. Return sorted operations with expected post-apply state.
 *
 * Both metadata file contents depend ONLY on config-derived data,
 * never on the plan's own operation counts.  This guarantees that
 * the second plan with the same config produces an empty operation list.
 */
export function plan(config: NrbConfig, currentState: SetupState = EMPTY_STATE): PlanResult {
  const { apps, capabilities, preset } = resolveConfig(config);
  const cfgHash = configHash(config);

  // Generate deterministic file contents — depends only on config
  const configFile = generateConfigFile(config);
  const summary = { apps: [...apps].sort(), capabilities: [...capabilities].sort(), preset, configHash: cfgHash };
  const summaryFile = generateSummaryMd(summary);

  // Build desired files map with stable hashes
  const desiredFiles: Record<string, string> = {};
  desiredFiles[configFile.path] = hashString(configFile.content);
  desiredFiles[summaryFile.path] = hashString(summaryFile.content);

  // Diff against current state
  const diff = diffState(currentState, desiredFiles);

  // Prunable files (only when prune option is set)
  const prunableFiles = config.options.prune ? diff.toPrune : [];

  // Build operations
  const operations: SetupOperation[] = [];

  // Deletes first (if pruning enabled)
  for (const p of prunableFiles) {
    operations.push(deleteFile(p, "Prune " + p));
  }

  // Creates (files not in current state)
  for (const p of diff.toCreate) {
    const content = p === configFile.path ? configFile.content : summaryFile.content;
    operations.push(createFile(p, content, "Create " + p));
  }

  // Updates (files whose content hash changed)
  for (const p of diff.toUpdate) {
    const content = p === configFile.path ? configFile.content : summaryFile.content;
    operations.push(updateFile(p, content, "Update " + p));
  }

  const sortedOps = sortOperations(operations);

  // Build expected state — after applying, files will match desiredFiles
  const expectedState = buildState(cfgHash, desiredFiles);

  return {
    operations: sortedOps,
    configHash: cfgHash,
    expectedState,
    prunableFiles,
    summary,
  };
}
