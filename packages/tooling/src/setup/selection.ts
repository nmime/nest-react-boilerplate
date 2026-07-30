/**
 * Repeatable application/capability selection updates.
 *
 * Presets are optional shortcuts. Explicit updates are additive by default so
 * a developer can rerun setup later without losing the current workspace
 * selection. `replace` starts from an empty selection, while explicit removal
 * refuses to break dependency closure.
 */
import {
  appCatalog,
  capabilityCatalog,
  durableDatabaseProviderIds,
  expandDependencies,
  validateSelection,
} from './catalog.js';
import { expandPreset } from './presets.js';
import {
  parseNrbConfig,
  schemaVersion,
  type AppId,
  type CapabilityId,
  type NrbConfig,
  type PresetId,
} from './schema.js';

export interface SelectionUpdate {
  preset?: string;
  addApps?: readonly string[];
  addCapabilities?: readonly string[];
  removeApps?: readonly string[];
  removeCapabilities?: readonly string[];
  replace?: boolean;
  options?: Partial<NrbConfig['options']>;
}

export interface ResolvedSelection {
  apps: AppId[];
  capabilities: CapabilityId[];
}

/** Resolve a persisted config into its complete dependency-closed selection. */
export function materializeSelection(config: NrbConfig): ResolvedSelection {
  const apps = new Set<AppId>(config.apps);
  const capabilities = new Set<CapabilityId>(config.capabilities);

  if (config.preset) {
    const preset = expandPreset(config.preset);
    for (const app of preset.apps) {
      apps.add(app);
    }
    for (const capability of preset.capabilities) {
      capabilities.add(capability);
    }
  }

  return expandDependencies([...apps], [...capabilities]);
}

/**
 * Apply an exact preset or an additive/custom update to an existing config.
 *
 * - `preset` starts from that preset and replaces the previous selection.
 * - no preset starts from the existing resolved selection.
 * - `replace` starts from an empty selection.
 * - additions/removals produce an explicit custom config with no retained
 *   preset, so a later removal cannot be silently re-added by the preset.
 */
export function updateSelection(existing: NrbConfig | null, update: SelectionUpdate): NrbConfig {
  const additions = parseSelectionLists(update.addApps, update.addCapabilities);
  const removals = parseSelectionLists(update.removeApps, update.removeCapabilities);

  let preset: PresetId | undefined;
  let base: ResolvedSelection;

  if (update.preset !== undefined) {
    const parsedPreset = parseNrbConfig({ schemaVersion, preset: update.preset }).preset;
    if (parsedPreset === undefined) {
      throw new Error('Preset selection could not be resolved.');
    }
    preset = parsedPreset;
    base = expandPreset(parsedPreset);
  } else if (update.replace) {
    base = { apps: [], capabilities: [] };
  } else if (existing) {
    base = materializeSelection(existing);
  } else {
    base = { apps: [], capabilities: [] };
  }

  const apps = new Set<AppId>(base.apps);
  const capabilities = new Set<CapabilityId>(base.capabilities);
  for (const app of additions.apps) {
    apps.add(app);
  }
  for (const capability of additions.capabilities) {
    capabilities.add(capability);
  }
  for (const app of removals.apps) {
    apps.delete(app);
  }
  for (const capability of removals.capabilities) {
    capabilities.delete(capability);
  }

  const resolved = expandDependencies([...apps], [...capabilities]);
  const providerWasUpdated = [...additions.capabilities, ...removals.capabilities].some((capability) =>
    durableDatabaseProviderIds.includes(capability as (typeof durableDatabaseProviderIds)[number]),
  );
  const requiresDatabase =
    resolved.apps.some((app) => appCatalog[app].requiresDurableDatabase) ||
    resolved.capabilities.some((capability) => capabilityCatalog[capability].requiresDurableDatabase);
  if (
    requiresDatabase &&
    !providerWasUpdated &&
    !durableDatabaseProviderIds.some((provider) => resolved.capabilities.includes(provider))
  ) {
    resolved.capabilities.push('postgres');
    resolved.capabilities.sort();
  }
  assertRemovalsAreAllowed(removals, resolved);
  assertSelectionIsValid(resolved);

  const customized =
    additions.apps.length > 0 ||
    additions.capabilities.length > 0 ||
    removals.apps.length > 0 ||
    removals.capabilities.length > 0 ||
    update.replace === true;

  const defaultOptions: NrbConfig['options'] = {
    prune: false,
    force: false,
    dryRun: false,
    nonInteractive: false,
  };
  const options = { ...defaultOptions, ...update.options };

  if (preset && !customized) {
    return parseNrbConfig({ schemaVersion, preset, options });
  }

  return parseNrbConfig({
    schemaVersion,
    apps: resolved.apps,
    capabilities: resolved.capabilities,
    options,
  });
}

function assertSelectionIsValid(selection: ResolvedSelection): void {
  const issues = validateSelection(selection.apps, selection.capabilities);
  if (issues.length > 0) {
    throw new Error(`Invalid setup selection: ${issues.map((issue) => issue.message).join('; ')}`);
  }
}

function parseSelectionLists(
  apps: readonly string[] | undefined,
  capabilities: readonly string[] | undefined,
): ResolvedSelection {
  const parsed = parseNrbConfig({
    schemaVersion,
    apps: apps ?? [],
    capabilities: capabilities ?? [],
  });
  return { apps: parsed.apps, capabilities: parsed.capabilities };
}

function assertRemovalsAreAllowed(removed: ResolvedSelection, resolved: ResolvedSelection): void {
  for (const app of removed.apps) {
    if (!resolved.apps.includes(app)) {
      continue;
    }
    const dependants = resolved.apps.filter((candidate) => appCatalog[candidate].requiresApps.includes(app));
    const reason = dependants.length > 0 ? `; required by ${dependants.join(', ')}` : '';
    throw new Error(`Cannot remove application "${app}" because it remains a required dependency${reason}.`);
  }

  for (const capability of removed.capabilities) {
    if (!resolved.capabilities.includes(capability)) {
      continue;
    }
    const appDependants = resolved.apps.filter((app) => appCatalog[app].requiresCapabilities.includes(capability));
    const capabilityDependants = resolved.capabilities.filter((candidate) =>
      capabilityCatalog[candidate].requiresCapabilities.includes(capability),
    );
    const dependants = [...appDependants, ...capabilityDependants];
    const reason = dependants.length > 0 ? `; required by ${dependants.join(', ')}` : '';
    throw new Error(`Cannot remove capability "${capability}" because it remains a required dependency${reason}.`);
  }
}
