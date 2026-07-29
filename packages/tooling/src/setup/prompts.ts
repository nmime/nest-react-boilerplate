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
import { defaultDeploymentConfig, defaultProductConfig, schemaVersion } from './schema.js';
import { presets, expandPreset } from './presets.js';
import { appCatalog, capabilityCatalog, durableDatabaseProviderIds, expandDependencies } from './catalog.js';
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
  product: NrbConfig['product'];
  deployment: NrbConfig['deployment'];
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
      product: existing?.product ?? {
        ...defaultProductConfig,
        mobileTargets: [...defaultProductConfig.mobileTargets],
      },
      deployment: existing?.deployment ?? {
        ...defaultDeploymentConfig,
        targets: [...defaultDeploymentConfig.targets],
        infrastructure: { ...defaultDeploymentConfig.infrastructure },
      },
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
  const referenceApps = Object.values(appCatalog).filter((app) => app.classification === 'reference');
  const frontendApps = referenceApps.filter((app) => app.platform === 'frontend');
  const backendApps = referenceApps.filter((app) => app.platform === 'backend');
  const e2eApps = referenceApps.filter((app) => app.platform === 'e2e');
  const optionalApps = Object.values(appCatalog).filter((app) => app.classification === 'optional');

  await promptAppGroup(io, 'Frontend applications', frontendApps, selectedApps);
  await promptAppGroup(io, 'Backend APIs', backendApps, selectedApps);
  await promptAppGroup(io, 'Full-stack E2E applications', e2eApps, selectedApps);
  await promptAppGroup(io, 'Optional integration APIs', optionalApps, selectedApps);

  const appClosed = expandDependencies([...selectedApps], initial.capabilities);
  const selectedCapabilities = new Set<CapabilityId>(appClosed.capabilities);
  await promptCapabilityGroup(io, selectedCapabilities);
  await promptDatabaseProvider(io, new Set(appClosed.apps), selectedCapabilities);

  const resolved = expandDependencies([...selectedApps], [...selectedCapabilities]);
  const autoAddedApps = resolved.apps.filter((app) => !selectedApps.has(app));
  const autoAddedCapabilities = resolved.capabilities.filter((capability) => !selectedCapabilities.has(capability));
  if (autoAddedApps.length > 0) {
    io.write(`\nRequired applications added automatically: ${autoAddedApps.join(', ')}\n`);
  }
  if (autoAddedCapabilities.length > 0) {
    io.write(`Required capabilities added automatically: ${autoAddedCapabilities.join(', ')}\n`);
  }

  const { product, deployment } = await promptProductAndDeployment(io, existing, resolved.apps, resolved.capabilities);

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
    product,
    deployment,
  };
}

async function promptProductAndDeployment(
  io: PromptIo,
  existing: NrbConfig | null,
  apps: AppId[],
  capabilities: CapabilityId[],
): Promise<Pick<PromptResult, 'product' | 'deployment'>> {
  io.write('\nProduct and deployment:\n');
  const currentProduct = existing?.product ?? {
    ...defaultProductConfig,
    mobileTargets: [...defaultProductConfig.mobileTargets],
  };
  const currentDeployment = existing?.deployment ?? {
    ...defaultDeploymentConfig,
    targets: [...defaultDeploymentConfig.targets],
    infrastructure: { ...defaultDeploymentConfig.infrastructure },
  };
  const ciMode = (await askChoice(
    io,
    'Choose CI scope',
    [
      { label: 'Product selection', value: 'product' },
      { label: 'Template maintainer full workspace', value: 'maintainer' },
    ],
    currentProduct.ciMode === 'product' ? 0 : 1,
  )) as NrbConfig['product']['ciMode'];
  const frontendApiMode = (await askChoice(
    io,
    'Choose frontend API topology',
    [
      { label: 'Same origin', value: 'same-origin' },
      { label: 'Split origin', value: 'split-origin' },
    ],
    currentProduct.frontendApiMode === 'same-origin' ? 0 : 1,
  )) as NrbConfig['product']['frontendApiMode'];
  const mobileTargets: NrbConfig['product']['mobileTargets'] = [];
  if (apps.includes('mobile-app')) {
    for (const target of ['web', 'android', 'ios'] as const) {
      if (isYes(await io.ask(`  Build mobile target ${target}`, currentProduct.mobileTargets.includes(target) ? 'y' : 'n'))) {
        mobileTargets.push(target);
      }
    }
    if (mobileTargets.length === 0) throw new Error('mobile-app requires at least one mobile target.');
  }
  const targets: NrbConfig['deployment']['targets'] = [];
  for (const target of ['docker', 'single-server', 'kubernetes'] as const) {
    if (isYes(await io.ask(`  Enable deployment target ${target}`, currentDeployment.targets.includes(target) ? 'y' : 'n'))) {
      targets.push(target);
    }
  }
  if (targets.length === 0) throw new Error('Select at least one deployment target.');
  const publicTopology = (await askChoice(
    io,
    'Choose public topology',
    [
      { label: 'Single domain', value: 'single-domain' },
      { label: 'Per-app domains', value: 'per-app-domains' },
      { label: 'External proxy', value: 'external-proxy' },
    ],
    ['single-domain', 'per-app-domains', 'external-proxy'].indexOf(currentDeployment.publicTopology),
  )) as NrbConfig['deployment']['publicTopology'];
  const kubernetesDelivery = (await askChoice(
    io,
    'Choose Kubernetes delivery',
    [
      { label: 'Direct Helm', value: 'direct' },
      { label: 'Argo CD', value: 'argocd' },
      { label: 'Flux', value: 'flux' },
    ],
    ['direct', 'argocd', 'flux'].indexOf(currentDeployment.kubernetesDelivery),
  )) as NrbConfig['deployment']['kubernetesDelivery'];
  const infrastructure = { ...currentDeployment.infrastructure };
  for (const capability of ['redis', 'nats', 's3'] as const) {
    if (!capabilities.includes(capability)) continue;
    infrastructure[capability] = (await askChoice(
      io,
      `Choose ${capability.toUpperCase()} ownership`,
      [
        { label: 'Bundled service', value: 'bundled' },
        { label: 'External service', value: 'external' },
      ],
      infrastructure[capability] === 'bundled' ? 0 : 1,
    )) as NrbConfig['deployment']['infrastructure'][typeof capability];
  }
  return {
    product: { ciMode, frontendApiMode, mobileTargets },
    deployment: { targets, publicTopology, kubernetesDelivery, infrastructure },
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
    if (durableDatabaseProviderIds.includes(id as (typeof durableDatabaseProviderIds)[number])) {
      continue;
    }
    const checked = selected.has(id) ? '[x]' : '[ ]';
    const answer = await io.ask(`  ${checked} ${entry.label} (${id})`, selected.has(id) ? 'y' : 'n');
    if (isYes(answer)) {
      selected.add(id);
    } else {
      selected.delete(id);
    }
  }
}

async function promptDatabaseProvider(
  io: PromptIo,
  selectedApps: Set<AppId>,
  selectedCapabilities: Set<CapabilityId>,
): Promise<void> {
  const requiresDatabase =
    [...selectedApps].some((appId) => appCatalog[appId].requiresDurableDatabase) ||
    [...selectedCapabilities].some((capabilityId) => capabilityCatalog[capabilityId].requiresDurableDatabase);
  const currentProvider = durableDatabaseProviderIds.find((provider) => selectedCapabilities.has(provider));
  const choices = [
    ...(!requiresDatabase ? [{ label: 'No durable database', value: 'none' }] : []),
    ...durableDatabaseProviderIds.map((provider) => ({
      label: capabilityCatalog[provider].label,
      value: provider,
    })),
  ];
  const defaultValue = currentProvider ?? (requiresDatabase ? 'postgres' : 'none');
  const defaultIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.value === defaultValue),
  );
  const selectedProvider = await askChoice(io, 'Choose a durable database provider', choices, defaultIndex);

  for (const provider of durableDatabaseProviderIds) {
    selectedCapabilities.delete(provider);
  }
  if (selectedProvider !== 'none') {
    selectedCapabilities.add(selectedProvider as (typeof durableDatabaseProviderIds)[number]);
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
    product?: Partial<NrbConfig['product']>;
    deployment?: Partial<NrbConfig['deployment']>;
    options?: Partial<NrbConfig['options']>;
  } = {},
): NrbConfig {
  return {
    schemaVersion,
    preset: overrides.preset ?? prompts.preset,
    apps: overrides.apps ?? prompts.apps,
    capabilities: overrides.capabilities ?? prompts.capabilities,
    product: {
      ...prompts.product,
      ...overrides.product,
      mobileTargets: overrides.product?.mobileTargets ?? prompts.product.mobileTargets,
    },
    deployment: {
      ...prompts.deployment,
      ...overrides.deployment,
      targets: overrides.deployment?.targets ?? prompts.deployment.targets,
      infrastructure: overrides.deployment?.infrastructure ?? prompts.deployment.infrastructure,
    },
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
export function formatConfigSummary(
  config: NrbConfig,
  resolvedSelection: { apps: readonly string[]; capabilities: readonly string[] } = config,
): string {
  const lines: string[] = [];
  lines.push('Configuration:');
  if (config.preset) {
    lines.push(`  Preset: ${config.preset}`);
  }
  lines.push(`  Apps: ${resolvedSelection.apps.length ? resolvedSelection.apps.join(', ') : '(none)'}`);
  lines.push(
    `  Capabilities: ${resolvedSelection.capabilities.length ? resolvedSelection.capabilities.join(', ') : '(none)'}`,
  );
  lines.push(`  CI mode: ${config.product.ciMode}`);
  lines.push(`  Frontend API mode: ${config.product.frontendApiMode}`);
  lines.push(`  Mobile targets: ${config.product.mobileTargets.join(', ') || '(none)'}`);
  lines.push(`  Deployment targets: ${config.deployment.targets.join(', ')}`);
  lines.push(`  Public topology: ${config.deployment.publicTopology}`);
  lines.push(`  Kubernetes delivery: ${config.deployment.kubernetesDelivery}`);
  lines.push(
    `  Infrastructure: redis=${config.deployment.infrastructure.redis}, nats=${config.deployment.infrastructure.nats}, s3=${config.deployment.infrastructure.s3}`,
  );
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
