/**
 * Interactive readline prompts for the NRB setup CLI.
 *
 * Pure prompt logic — no filesystem writes.  Uses Node's `readline/promises`
 * for interactive input. When `nonInteractive` is true, nothing is read from
 * stdin and no application is selected implicitly.
 *
 * Dependency-aware: enables required capabilities automatically and warns
 * the user when selected apps bring transitive dependencies.
 */
import * as readline from 'node:readline/promises';
import type { NrbConfig, PresetId } from './schema.js';
import { schemaVersion } from './schema.js';
import { presets, expandPreset } from './presets.js';
import { appCatalog, capabilityCatalog, expandDependencies } from './catalog.js';
import type { AppId, CapabilityId } from './schema.js';
import { materializeSelection } from './selection.js';

// ---------------------------------------------------------------------------
// Prompt I/O — injectable so the complete interactive flow is testable.
// ---------------------------------------------------------------------------

export interface PromptIo {
  ask(question: string, defaultAnswer?: string): Promise<string>;
  write(content: string): void;
  close?(): void;
}

function createPromptIo(): PromptIo {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    async ask(question, defaultAnswer) {
      const suffix = defaultAnswer !== undefined ? ` [${defaultAnswer}]` : '';
      const answer = await rl.question(`${question}${suffix}: `);
      return answer.trim() || (defaultAnswer ?? '');
    },
    write(content) {
      process.stdout.write(content);
    },
    close() {
      rl.close();
    },
  };
}

/** Present numbered choices, return the selected value. */
async function askChoice(
  io: PromptIo,
  question: string,
  choices: { label: string; value: string }[],
  defaultIndex = 0,
): Promise<string> {
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    if (choice === undefined) {
      continue;
    }
    const marker = i === defaultIndex ? ' (*)' : '';
    io.write(`  ${i + 1}. ${choice.label}${marker}\n`);
  }
  const answer = await io.ask(`${question}\n  Select (1-${choices.length})`, String(defaultIndex + 1));
  const idx = parseInt(answer, 10) - 1;
  const selected = choices[idx] ?? choices[defaultIndex];
  if (selected === undefined) {
    throw new Error(`Cannot ask "${question}" without at least one choice.`);
  }
  return selected.value;
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
 * Run the selection flow. Existing choices are the defaults on rerun. A fresh
 * non-interactive invocation remains empty: the CLI requires an explicit
 * preset, app, or config instead of choosing a default application.
 */
export async function runPrompts(
  nonInteractive: boolean = false,
  existing: NrbConfig | null = null,
  injectedIo?: PromptIo,
): Promise<PromptResult> {
  if (nonInteractive) {
    const selected = existing ? materializeSelection(existing) : { apps: [], capabilities: [] };
    return {
      apps: selected.apps,
      capabilities: selected.capabilities,
      prune: false,
      force: false,
      dryRun: false,
    };
  }

  const io = injectedIo ?? createPromptIo();
  try {
    return await interactiveFlow(existing, io);
  } finally {
    io.close?.();
  }
}

async function interactiveFlow(existing: NrbConfig | null, io: PromptIo): Promise<PromptResult> {
  io.write('\n=== NRB Application Selection ===\n\n');

  let initial: { apps: AppId[]; capabilities: CapabilityId[] };
  if (existing) {
    initial = materializeSelection(existing);
    io.write('Current selection loaded. Press Enter to keep an item, or answer y/n to change it.\n\n');
  } else {
    const startingPoints = [
      { label: 'custom — select only the applications this product needs', value: 'custom' },
      ...presets.map((preset) => ({
        label: `${preset.id} — ${preset.description}`,
        value: preset.id,
      })),
    ];
    const selectedStartingPoint = await askChoice(io, 'Choose a starting point', startingPoints, 0);
    initial =
      selectedStartingPoint === 'custom'
        ? { apps: [], capabilities: [] }
        : expandPreset(selectedStartingPoint as PresetId);
    io.write('\nEvery item remains individually selectable; profiles are shortcuts, not permanent defaults.\n');
  }

  const selectedApps = new Set<AppId>(initial.apps);
  const frontendApps = Object.values(appCatalog).filter((app) => app.platform === 'frontend');
  const backendApps = Object.values(appCatalog).filter((app) => app.platform === 'backend');
  const e2eApps = Object.values(appCatalog).filter((app) => app.platform === 'e2e');

  await promptAppGroup(io, 'Frontend applications', frontendApps, selectedApps);
  await promptAppGroup(io, 'Backend applications', backendApps, selectedApps);
  await promptAppGroup(io, 'E2E applications', e2eApps, selectedApps);

  const appClosed = expandDependencies([...selectedApps], initial.capabilities);
  const selectedCapabilities = new Set<CapabilityId>(appClosed.capabilities);
  await promptCapabilityGroup(io, selectedCapabilities);

  const resolved = expandDependencies([...selectedApps], [...selectedCapabilities]);
  const autoAddedApps = resolved.apps.filter((app) => !selectedApps.has(app));
  const autoAddedCapabilities = resolved.capabilities.filter((capability) => !selectedCapabilities.has(capability));
  if (autoAddedApps.length > 0) {
    io.write(`\nRequired applications added automatically: ${autoAddedApps.join(', ')}\n`);
  }
  if (autoAddedCapabilities.length > 0) {
    io.write(`Required capabilities added automatically: ${autoAddedCapabilities.join(', ')}\n`);
  }

  const prune = isYes(await io.ask('Prune stale setup-managed files', 'no'));
  const force = isYes(await io.ask('Force overwrite setup-managed conflicts', 'no'));
  const dryRun = isYes(await io.ask('Dry run (show plan only)', 'no'));
  io.write('\n');

  return {
    apps: resolved.apps,
    capabilities: resolved.capabilities,
    prune,
    force,
    dryRun,
  };
}

async function promptAppGroup(
  io: PromptIo,
  groupLabel: string,
  apps: Array<{ id: AppId; label: string }>,
  selected: Set<AppId>,
): Promise<void> {
  if (apps.length === 0) {
    return;
  }

  io.write(`\n${groupLabel}:\n`);
  for (const app of apps) {
    const checked = selected.has(app.id) ? '[x]' : '[ ]';
    const answer = await io.ask(`  ${checked} ${app.label} (${app.id})`, selected.has(app.id) ? 'y' : 'n');
    if (isYes(answer)) {
      selected.add(app.id);
    } else {
      selected.delete(app.id);
    }
  }
}

async function promptCapabilityGroup(io: PromptIo, selected: Set<CapabilityId>): Promise<void> {
  io.write('\nCapabilities:\n');
  for (const [capabilityId, entry] of Object.entries(capabilityCatalog)) {
    const id = capabilityId as CapabilityId;
    const checked = selected.has(id) ? '[x]' : '[ ]';
    const answer = await io.ask(`  ${checked} ${entry.label} (${id})`, selected.has(id) ? 'y' : 'n');
    if (isYes(answer)) {
      selected.add(id);
    } else {
      selected.delete(id);
    }
  }
}

function isYes(answer: string): boolean {
  const normalized = answer.toLowerCase();
  return normalized === 'y' || normalized === 'yes';
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
    preset?: NrbConfig['preset'];
    apps?: NrbConfig['apps'];
    capabilities?: NrbConfig['capabilities'];
    options?: Partial<NrbConfig['options']>;
  } = {},
): NrbConfig {
  return {
    schemaVersion,
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
  lines.push('Configuration:');
  if (config.preset) {
    lines.push(`  Preset: ${config.preset}`);
  }
  lines.push(`  Apps: ${config.apps.length ? config.apps.join(', ') : '(none)'}`);
  lines.push(`  Capabilities: ${config.capabilities.length ? config.capabilities.join(', ') : '(none)'}`);
  lines.push(`  Options:`);
  lines.push(`    prune: ${config.options.prune}`);
  lines.push(`    force: ${config.options.force}`);
  lines.push(`    dryRun: ${config.options.dryRun}`);
  lines.push(`    nonInteractive: ${config.options.nonInteractive}`);
  return lines.join('\n');
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
  return lines.join('\n');
}
