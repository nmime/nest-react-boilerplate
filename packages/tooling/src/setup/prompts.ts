/**
 * Interactive readline prompts for the NRB setup CLI.
 *
 * Pure prompt logic — no filesystem writes.  Uses Node's `readline/promises`
 * for interactive input.  When `nonInteractive` is true, all questions are
 * answered with defaults and nothing is read from stdin.
 *
 * Dependency-aware: enables required capabilities automatically and warns
 * the user when selected apps bring transitive dependencies.
 */
import * as readline from "node:readline/promises";
import type { NrbConfig, PresetId } from "./schema.js";
import { PRESET_IDS, SCHEMA_VERSION } from "./schema.js";
import { PRESETS, findPreset } from "./presets.js";
import { APP_CATALOG, CAPABILITY_CATALOG } from "./catalog.js";
import type { AppId, CapabilityId } from "./schema.js";

// ---------------------------------------------------------------------------
// Process I/O handles — lazy to avoid keeping the event loop alive in tests
// ---------------------------------------------------------------------------

let rl: readline.Interface | null = null;

function getRl(): readline.Interface {
  if (rl === null) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

/** Ask a single question.  Returns the raw answer string. */
async function ask(question: string, defaultAnswer?: string): Promise<string> {
  const suffix = defaultAnswer !== undefined ? ` [${defaultAnswer}]` : "";
  const answer = await getRl().question(`${question}${suffix}: `);
  return answer.trim() || (defaultAnswer ?? "");
}

/** Present numbered choices, return the selected value. */
async function askChoice(
  question: string,
  choices: { label: string; value: string }[],
  defaultIndex = 0,
): Promise<string> {
  for (let i = 0; i < choices.length; i++) {
    const marker = i === defaultIndex ? " (*)" : "";
    process.stdout.write(`  ${i + 1}. ${choices[i].label}${marker}\n`);
  }
  const answer = await ask(
    `${question}\n  Select (1-${choices.length})`,
    String(defaultIndex + 1),
  );
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < choices.length) return choices[idx].value;
  return choices[defaultIndex].value;
}

// ---------------------------------------------------------------------------
// Prompt result
// ---------------------------------------------------------------------------

export interface PromptResult {
  preset?: PresetId;
  apps: AppId[];
  capabilities: CapabilityId[];
  prune: boolean;
  force: boolean;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Core prompt flow
// ---------------------------------------------------------------------------

/**
 * Run the interactive prompt flow.  Collects preset selection, app/capability
 * toggles, and generation options.
 *
 * When `nonInteractive` is true, skips all readline calls and returns a
 * sensible default configuration (minimal preset).
 */
export async function runPrompts(
  nonInteractive: boolean = false,
): Promise<PromptResult> {
  if (nonInteractive) {
    return getNonInteractiveDefaults();
  }
  return interactiveFlow();
}

/**
 * Non-interactive defaults: minimal preset, no extra apps/caps, dry-run off.
 */
function getNonInteractiveDefaults(): PromptResult {
  return {
    preset: "minimal",
    apps: [],
    capabilities: [],
    prune: false,
    force: false,
    dryRun: false,
  };
}

/**
 * Interactive flow: guides the user through preset selection, app and
 * capability toggles, and generation options.
 */
async function interactiveFlow(): Promise<PromptResult> {
  process.stdout.write("\n=== NRB Setup Wizard ===\n\n");

  // 1. Preset selection
  const presetChoices = PRESETS.map((p) => ({
    label: `${p.id} — ${p.description}`,
    value: p.id,
  }));
  const selectedPreset = (await askChoice(
    "Select a starting preset",
    presetChoices,
    1,
  )) as PresetId;
  process.stdout.write("\n");

  // Show what the preset includes
  const presetDef = findPreset(selectedPreset);
  if (presetDef) {
    process.stdout.write(
      `Preset "${selectedPreset}" includes:\n`,
    );
    process.stdout.write(`  Apps: ${presetDef.apps.join(", ")}\n`);
    process.stdout.write(
      `  Capabilities: ${presetDef.capabilities.join(", ")}\n`,
    );
    process.stdout.write("\n");
  }

  // 2. App toggles
  const selectedApps = new Set<AppId>();
  if (presetDef) {
    for (const a of presetDef.apps) selectedApps.add(a);
  }

  const frontendApps = Object.values(APP_CATALOG).filter(
    (a) => a.platform === "frontend",
  );
  const backendApps = Object.values(APP_CATALOG).filter(
    (a) => a.platform === "backend",
  );
  const e2eApps = Object.values(APP_CATALOG).filter(
    (a) => a.platform === "e2e",
  );

  await promptAppGroup("Frontend Apps", frontendApps, selectedApps);
  await promptAppGroup("Backend Apps", backendApps, selectedApps);
  await promptAppGroup("E2E Apps", e2eApps, selectedApps);

  // Auto-add required app dependencies
  const autoAddedApps = new Set<AppId>();
  for (const appId of [...selectedApps]) {
    const entry = APP_CATALOG[appId];
    if (entry) {
      for (const req of entry.requiresApps) {
        if (!selectedApps.has(req)) {
          selectedApps.add(req);
          autoAddedApps.add(req);
        }
      }
    }
  }
  if (autoAddedApps.size > 0) {
    process.stdout.write(
      `\nAuto-enabled apps (required dependencies): ${[...autoAddedApps].join(", ")}\n\n`,
    );
  }

  // 3. Capability toggles
  const selectedCaps = new Set<CapabilityId>();
  if (presetDef) {
    for (const c of presetDef.capabilities) selectedCaps.add(c);
  }

  // Auto-add capabilities required by selected apps
  for (const appId of [...selectedApps]) {
    const entry = APP_CATALOG[appId];
    if (entry) {
      for (const req of entry.requiresCapabilities) {
        selectedCaps.add(req);
      }
    }
  }

  await promptCapabilityGroup(selectedCaps);

  // Auto-add capability transitive deps
  let changed = true;
  while (changed) {
    changed = false;
    for (const capId of [...selectedCaps]) {
      const entry = CAPABILITY_CATALOG[capId];
      if (entry) {
        for (const req of entry.requiresCapabilities) {
          if (!selectedCaps.has(req)) {
            selectedCaps.add(req);
            changed = true;
          }
        }
      }
    }
  }

  // 4. Options
  const prune = (await ask("Prune unused files on change", "no")) !== "no";
  const force = (await ask("Force overwrite on conflicts", "no")) !== "no";
  const dryRun = (await ask("Dry run (show plan only)", "no")) !== "no";

  process.stdout.write("\n");

  return {
    preset: selectedPreset,
    apps: [...selectedApps].sort(),
    capabilities: [...selectedCaps].sort(),
    prune,
    force,
    dryRun,
  };
}

/** Prompt the user to toggle a group of apps. */
async function promptAppGroup(
  groupLabel: string,
  apps: Array<{ id: AppId; label: string }>,
  selected: Set<AppId>,
): Promise<void> {
  if (apps.length === 0) return;

  process.stdout.write(`\n${groupLabel}:\n`);
  for (const app of apps) {
    const checked = selected.has(app.id) ? "[x]" : "[ ]";
    const answer = await ask(
      `  ${checked} ${app.label} (${app.id}) [keep]`,
      selected.has(app.id) ? "y" : "n",
    );
    if (answer === "y" || answer === "yes" || answer === "") {
      selected.add(app.id);
    } else {
      selected.delete(app.id);
    }
  }
}

/** Prompt the user to toggle capabilities. */
async function promptCapabilityGroup(
  selected: Set<CapabilityId>,
): Promise<void> {
  process.stdout.write("\nCapabilities:\n");
  for (const [capId, entry] of Object.entries(CAPABILITY_CATALOG)) {
    const checked = selected.has(capId as CapabilityId) ? "[x]" : "[ ]";
    const answer = await ask(
      `  ${checked} ${entry.label} (${capId}) [keep]`,
      selected.has(capId as CapabilityId) ? "y" : "n",
    );
    if (answer === "y" || answer === "yes" || answer === "") {
      selected.add(capId as CapabilityId);
    } else {
      selected.delete(capId as CapabilityId);
    }
  }
}

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

/**
 * Build a validated NrbConfig from prompt results and CLI overrides.
 */
export function buildConfig(
  prompts: PromptResult,
  overrides: {
    preset?: NrbConfig["preset"];
    apps?: NrbConfig["apps"];
    capabilities?: NrbConfig["capabilities"];
    options?: Partial<NrbConfig["options"]>;
  } = {},
): NrbConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    preset: overrides.preset ?? prompts.preset,
    apps: overrides.apps ?? prompts.apps,
    capabilities: overrides.capabilities ?? prompts.capabilities,
    options: {
      prune: overrides.options?.prune ?? prompts.prune,
      force: overrides.options?.force ?? prompts.force,
      dryRun: overrides.options?.dryRun ?? prompts.dryRun,
      nonInteractive: overrides.options?.nonInteractive ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Pretty-print helpers
// ---------------------------------------------------------------------------

/** Format a config object as a human-readable summary for stdout. */
export function formatConfigSummary(config: NrbConfig): string {
  const lines: string[] = [];
  lines.push("Configuration:");
  if (config.preset) lines.push(`  Preset: ${config.preset}`);
  lines.push(`  Apps: ${config.apps.length ? config.apps.join(", ") : "(none)"}`);
  lines.push(
    `  Capabilities: ${config.capabilities.length ? config.capabilities.join(", ") : "(none)"}`,
  );
  lines.push(`  Options:`);
  lines.push(`    prune: ${config.options.prune}`);
  lines.push(`    force: ${config.options.force}`);
  lines.push(`    dryRun: ${config.options.dryRun}`);
  lines.push(`    nonInteractive: ${config.options.nonInteractive}`);
  return lines.join("\n");
}

/** Format a plan summary for stdout. */
export function formatPlanSummary(
  operations: Array<{ kind: string; path: string; description: string }>,
  configHash: string,
): string {
  const lines: string[] = [];
  lines.push(`Configuration hash: ${configHash}`);
  lines.push(`Operations: ${operations.length}`);
  for (const op of operations) {
    lines.push(`  ${op.kind}: ${op.path}`);
  }
  return lines.join("\n");
}
