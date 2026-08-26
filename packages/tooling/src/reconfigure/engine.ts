/**
 * Pure identity/runtime reconfigure planner.
 *
 * The engine reads through the shared FilesystemAdapter and returns ordered
 * update operations plus the manifest/state payloads that the caller must
 * persist in the same atomic transaction. It performs no writes itself.
 */
import type { FilesystemAdapter } from '../setup/adapters/filesystem.ts';
import { sortOperations, updateFile, type SetupOperation } from '../setup/operations.ts';
import { buildState, configHash, hashString, type SetupState } from '../setup/state.ts';
import {
  defaultDeploymentConfig,
  defaultIdentityBrandConfig,
  defaultIdentityConfig,
  defaultRuntimeConfig,
  defaultRuntimePorts,
  defaultSessionConfig,
  defaultTenantConfig,
  type NrbConfig,
} from '../setup/schema.ts';
import targetManifest from './identity-targets.json' with { type: 'json' };
import {
  applyApexHostSelection,
  buildAnchoredPortReplacements,
  buildOrderedReplacements,
  type AnchoredReplacement,
} from './rules.ts';

export const identityManifestPath = '.nrb/identity.json';
export const setupStatePath = '.nrb/state.json';
export const defaultConfigPath = 'nrb.config.json';

const targetManifestShape = targetManifest as {
  version: number;
  groups: Record<string, string[]>;
};

export interface AppliedFileManifest {
  hash: string;
  rules: string[];
}

export interface IdentityManifest {
  version: 1;
  templateBase: string;
  identity: NrbConfig['identity'];
  runtime: NrbConfig['runtime'];
  session: NrbConfig['session'];
  tenant: NrbConfig['tenant'];
  appRenames: NrbConfig['appRenames'];
  configHash: string;
  appliedFiles: Record<string, AppliedFileManifest>;
}

export interface ReconfigurePlan {
  operations: SetupOperation[];
  rewriteOperations: SetupOperation[];
  config: NrbConfig;
  configHash: string;
  manifest: IdentityManifest;
  state: SetupState;
  files: string[];
  rulesByFile: Record<string, string[]>;
  alreadyUpToDate: boolean;
}

export interface ReconfigurePlanOptions {
  fs: FilesystemAdapter;
  desired: NrbConfig;
  previous: NrbConfig;
  manifest?: IdentityManifest | null;
  state?: SetupState;
  templateBase: string;
  includeMetadata?: boolean;
  /** Explicit init-compatible target set. Reconfigure otherwise uses identity-targets.json. */
  targetPaths?: readonly string[];
}

export async function planReconfigure(options: ReconfigurePlanOptions): Promise<ReconfigurePlan> {
  const replacements = buildOrderedReplacements(options.previous, options.desired);
  const portReplacements = buildAnchoredPortReplacements(options.previous.runtime, options.desired.runtime);
  const candidates = (
    options.targetPaths ??
    selectTargetPaths(
      replacements.map((replacement) => replacement.label),
      portReplacements,
    )
  ).filter((path) => ![defaultConfigPath, identityManifestPath, setupStatePath].includes(path));
  const rewriteOperations: SetupOperation[] = [];
  const rulesByFile: Record<string, string[]> = {};

  for (const path of candidates) {
    const before = await options.fs.read(path);
    if (before === null) continue;
    const { content: after, rules } = applyRules(
      before,
      options.previous,
      options.desired,
      replacements,
      portReplacements,
    );
    if (after === before) continue;
    rewriteOperations.push(updateFile(path, after, `Reconfigure ${path}: ${rules.join(', ')}`));
    rulesByFile[path] = rules;
  }

  const desiredConfigHash = configHash(options.desired as unknown as Record<string, unknown>);
  const rewrittenContent = new Map<string, string>();
  for (const operation of rewriteOperations) {
    if (operation.kind === 'update_file') rewrittenContent.set(operation.path, operation.content);
  }

  const priorApplied = options.manifest?.appliedFiles ?? {};
  const appliedFiles: Record<string, AppliedFileManifest> = {};
  for (const path of [...new Set([...Object.keys(priorApplied), ...rewrittenContent.keys()])].sort()) {
    const content = rewrittenContent.get(path) ?? (await options.fs.read(path));
    if (content === null) continue;
    appliedFiles[path] = {
      hash: hashString(content),
      rules: rulesByFile[path] ?? priorApplied[path]?.rules ?? [],
    };
  }
  if (priorApplied[defaultConfigPath] !== undefined || rewrittenContent.has(defaultConfigPath)) {
    delete appliedFiles[defaultConfigPath];
  }
  if (priorApplied[identityManifestPath] !== undefined) delete appliedFiles[identityManifestPath];
  if (priorApplied[setupStatePath] !== undefined) delete appliedFiles[setupStatePath];

  const manifest: IdentityManifest = {
    version: 1,
    templateBase: options.templateBase,
    identity: options.desired.identity,
    runtime: options.desired.runtime,
    session: options.desired.session,
    tenant: options.desired.tenant,
    appRenames: options.desired.appRenames,
    configHash: desiredConfigHash,
    appliedFiles,
  };

  const files = {
    ...(options.state?.files ?? {}),
    ...Object.fromEntries(Object.entries(appliedFiles).map(([path, entry]) => [path, entry.hash])),
  };
  const metadataContent = new Map([
    [defaultConfigPath, serializeJson(options.desired)],
    [identityManifestPath, serializeJson(manifest)],
  ]);
  for (const [path, content] of metadataContent) files[path] = hashString(content);
  const state = buildState(
    desiredConfigHash,
    files,
    Object.fromEntries(Object.entries(appliedFiles).map(([path, entry]) => [path, entry.hash])),
  );
  metadataContent.set(setupStatePath, serializeJson(state));

  const operations = [...rewriteOperations];
  if (options.includeMetadata !== false) {
    for (const [path, content] of metadataContent) {
      const current = rewrittenContent.get(path) ?? (await options.fs.read(path));
      if (current !== content) operations.push(updateFile(path, content, `Record reconfigure state in ${path}`));
    }
  }

  return {
    operations: sortOperations(operations),
    rewriteOperations: sortOperations(rewriteOperations),
    config: options.desired,
    configHash: desiredConfigHash,
    manifest,
    state,
    files: candidates.filter((path) => rewrittenContent.has(path)),
    rulesByFile,
    alreadyUpToDate: rewriteOperations.length === 0,
  };
}

export function createIdentityManifestConfig(
  desired: NrbConfig,
  manifest: IdentityManifest | null | undefined,
): NrbConfig {
  if (!manifest) return createTemplateDefaultConfig(desired);
  return {
    ...desired,
    identity: manifest.identity,
    runtime: manifest.runtime,
    session: manifest.session,
    tenant: manifest.tenant,
    appRenames: manifest.appRenames,
    deployment: {
      ...desired.deployment,
      publicDomain: manifest.identity.domain,
      primaryApp: manifest.identity.apexApp,
    },
  };
}

export function createTemplateDefaultConfig(desired: NrbConfig): NrbConfig {
  return {
    ...desired,
    identity: {
      ...defaultIdentityConfig,
      brand: { ...defaultIdentityBrandConfig },
    },
    appRenames: {},
    deployment: {
      ...desired.deployment,
      publicDomain: defaultDeploymentConfig.publicDomain,
      primaryApp: defaultDeploymentConfig.primaryApp,
      imageRegistry: defaultDeploymentConfig.imageRegistry,
    },
    runtime: {
      ports: { ...defaultRuntimePorts },
      stagingOffset: defaultRuntimeConfig.stagingOffset,
      containerPort: defaultRuntimeConfig.containerPort,
      postgres: { ...defaultRuntimeConfig.postgres },
      minio: { ...defaultRuntimeConfig.minio },
      localSecrets: { ...defaultRuntimeConfig.localSecrets },
    },
    session: { ...defaultSessionConfig },
    tenant: {
      defaultTenantId: defaultTenantConfig.defaultTenantId,
      seed: {
        admin: { ...defaultTenantConfig.seed.admin },
        users: defaultTenantConfig.seed.users.map((user) => ({ ...user })),
      },
    },
  };
}

export function isIdentityManifest(raw: unknown): raw is IdentityManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.templateBase !== 'string' ||
    typeof value.configHash !== 'string' ||
    !value.identity ||
    !value.runtime ||
    !value.session ||
    !value.tenant ||
    !value.appRenames ||
    !value.appliedFiles ||
    typeof value.appliedFiles !== 'object' ||
    Array.isArray(value.appliedFiles)
  ) {
    return false;
  }
  for (const [path, entry] of Object.entries(value.appliedFiles as Record<string, unknown>)) {
    if (!isSafeRelativePath(path) || !entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const file = entry as Record<string, unknown>;
    if (typeof file.hash !== 'string' || !/^[a-f0-9]{64}$/u.test(file.hash) || !Array.isArray(file.rules)) {
      return false;
    }
  }
  return true;
}

export async function verifyIdentityManifest(manifest: IdentityManifest, fs: FilesystemAdapter): Promise<string[]> {
  const drifted: string[] = [];
  for (const [path, entry] of Object.entries(manifest.appliedFiles)) {
    if ([defaultConfigPath, identityManifestPath, setupStatePath].includes(path)) continue;
    const current = await fs.read(path);
    if (current === null || hashString(current) !== entry.hash) drifted.push(path);
  }
  return drifted.sort();
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function selectTargetPaths(labels: string[], ports: AnchoredReplacement[]): string[] {
  const groups = targetManifestShape.groups;
  const selected = new Set<string>();
  const add = (name: string) => {
    for (const path of groups[name] ?? []) selected.add(path);
  };
  if (labels.some((label) => label.startsWith('appRename:'))) add('applications');
  if (ports.length > 0 || labels.some((label) => label.startsWith('runtime:'))) add('runtime-ports');
  if (labels.some((label) => label.startsWith('session:') || label.startsWith('tenant:'))) {
    add('brand-session-tenant');
  }
  if (labels.some((label) => !label.startsWith('appRename:') && !label.startsWith('runtime:'))) add('identity');
  if (labels.some((label) => isBrandLabel(label))) add('brand-session-tenant');
  return [...selected].sort();
}

function isBrandLabel(label: string): boolean {
  return [
    'cliBin',
    'stateDir',
    'envPrefix',
    'imagePrefix',
    'imageTag',
    'redisKeyPrefix',
    'helmChart',
    'helmRelease',
    'natsClientName',
    's3Bucket',
  ].includes(label);
}

function applyRules(
  before: string,
  previous: NrbConfig,
  desired: NrbConfig,
  replacements: ReturnType<typeof buildOrderedReplacements>,
  ports: AnchoredReplacement[],
): { content: string; rules: string[] } {
  let content = before;
  const rules: string[] = [];
  for (const replacement of replacements) {
    const next = content.split(replacement.from).join(replacement.to);
    if (next !== content) rules.push(replacement.label);
    content = next;
  }
  for (const replacement of ports) {
    const next = applyAnchoredPortReplacement(content, replacement);
    if (next !== content) rules.push(replacement.label);
    content = next;
  }
  const apex = applyApexHostSelection(content, previous.identity, desired.identity);
  if (apex !== content) rules.push('identity:apexApp');
  return { content: apex, rules: [...new Set(rules)] };
}

function applyAnchoredPortReplacement(content: string, replacement: AnchoredReplacement): string {
  if (replacement.from === replacement.to) return content;
  if (replacement.label === 'containerPort' || replacement.label === 'stagingOffset') {
    return content;
  }
  const escaped = replacement.from.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  let result = content;
  result = result.replace(new RegExp(`(\\b[A-Z][A-Z0-9_]*_PORT\\s*=\\s*)${escaped}\\b`, 'gu'), `$1${replacement.to}`);
  result = result.replace(new RegExp(`(\\bport\\s*:\\s*)${escaped}\\b`, 'gu'), `$1${replacement.to}`);
  result = result.replace(new RegExp(`(["'])${escaped}(:\\d+)(["'])`, 'gu'), `$1${replacement.to}$2$3`);
  result = result.replace(new RegExp(`(\\|\\|\\s*)${escaped}\\b`, 'gu'), `$1${replacement.to}`);
  result = result.replace(new RegExp(`(\\?\\?\\s*)${escaped}\\b`, 'gu'), `$1${replacement.to}`);
  return result;
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.split('/').includes('..') && !path.includes('\\');
}
