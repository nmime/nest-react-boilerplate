#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCurrentSelectedClosure } from '../../runtime/deployment-artifact.js';
import type { SelectedClosureManifest } from '../../setup/closure.js';
import { appCatalog, capabilityCatalog } from '../../setup/catalog.js';
import { parseGeneratedEnvironment } from '../../setup/environment.js';
import { readConfiguredSelection, type ConfiguredSelection } from '../../setup/closure-workspace.js';
import { run } from './runtime.js';

export type SelectedDatabaseProvider = 'mongodb' | 'postgres';

export function validateSelectedDatabaseEnvironment(
  selectedProvider: SelectedDatabaseProvider | null,
  environment: Readonly<Record<string, string | undefined>>,
): SelectedDatabaseProvider | undefined {
  const capabilities = csvValues(environment['NRB_CAPABILITIES']);
  const profiles = csvValues(environment['COMPOSE_PROFILES']);
  const providers = (['mongodb', 'postgres'] as const).filter((provider) => capabilities.has(provider));
  if (providers.length > 1) {
    throw new Error('The setup selection must enable exactly one database provider: mongodb or postgres.');
  }

  if ((providers[0] ?? null) !== selectedProvider) {
    throw new Error(
      `Generated capabilities select ${providers[0] ?? 'no provider'}, but the fresh closure selects ${selectedProvider ?? 'no provider'}.`,
    );
  }

  if (!selectedProvider) {
    if (
      environment['DATABASE_ENGINE']?.trim() ||
      environment['AUTH_PERSISTENCE']?.trim() ||
      profiles.has('mongodb') ||
      profiles.has('postgres')
    ) {
      throw new Error('Provider-free setup values must not enable database selectors or Compose profiles.');
    }
    return undefined;
  }

  const provider = selectedProvider;
  const otherProvider = provider === 'mongodb' ? 'postgres' : 'mongodb';
  if (environment['DATABASE_ENGINE'] !== provider || environment['AUTH_PERSISTENCE'] !== provider) {
    throw new Error(`DATABASE_ENGINE and AUTH_PERSISTENCE must both match the selected ${provider} provider.`);
  }
  if (!profiles.has(provider) || profiles.has(otherProvider)) {
    throw new Error(`COMPOSE_PROFILES must enable only the selected ${provider} database profile.`);
  }

  if (provider === 'mongodb') {
    const uri = requiredEnvironmentValue(environment, 'MONGODB_URI');
    const database = requiredEnvironmentValue(environment, 'MONGODB_DATABASE');
    const replicaSet = requiredEnvironmentValue(environment, 'MONGODB_REPLICA_SET');
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error('MONGODB_URI in .nrb/capabilities.env is invalid; rerun setup.');
    }
    if (
      parsed.protocol !== 'mongodb:' ||
      parsed.hostname !== 'mongodb.localhost' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      decodeURIComponent(parsed.pathname.slice(1)) !== database ||
      parsed.searchParams.get('replicaSet') !== replicaSet ||
      parsed.searchParams.get('retryWrites') !== 'true'
    ) {
      throw new Error('MongoDB setup values must describe the generated credential-free local replica set.');
    }
  } else {
    requiredEnvironmentValue(environment, 'DATABASE_URL');
    requiredEnvironmentValue(environment, 'CONTAINER_DATABASE_URL');
  }

  return provider;
}

export function validateSelectedComposeServices(
  provider: SelectedDatabaseProvider | undefined,
  expectedServices: readonly string[],
  actualServices: readonly string[],
): void {
  const selectedServices = new Set(actualServices);
  const expected = new Set(expectedServices);
  const required = provider === 'mongodb'
    ? ['mongodb', 'mongodb-init', 'mongodb-migrate']
    : provider === 'postgres'
      ? ['postgres', 'migrate']
      : [];
  const forbidden = provider === 'mongodb'
    ? ['postgres', 'migrate']
    : provider === 'postgres'
      ? ['mongodb', 'mongodb-init', 'mongodb-migrate']
      : ['mongodb', 'mongodb-init', 'mongodb-migrate', 'postgres', 'migrate'];
  const missing = [...expected].filter((service) => !selectedServices.has(service));
  const unexpected = [...selectedServices].filter((service) => !expected.has(service));
  const missingProviderServices = required.filter((service) => !selectedServices.has(service));
  const forbiddenProviderServices = forbidden.filter((service) => selectedServices.has(service));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Selected ${provider ?? 'provider-free'} Compose graph is invalid (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}).`,
    );
  }
  if (missingProviderServices.length > 0 || forbiddenProviderServices.length > 0) {
    throw new Error(`Selected ${provider ?? 'provider-free'} Compose graph violates its database service boundary.`);
  }
}

export function validateGeneratedSelectionEnvironment(
  closure: SelectedClosureManifest,
  selection: ConfiguredSelection,
  environment: Readonly<Record<string, string | undefined>>,
): void {
  assertExactCsv('NRB_APPS', environment.NRB_APPS, selection.apps);
  assertExactCsv('NRB_CAPABILITIES', environment.NRB_CAPABILITIES, selection.capabilities);
  const expectedProfiles = new Set<string>(selection.apps);
  for (const capability of selection.capabilities) {
    if (capabilityCatalog[capability].dockerServices.length > 0) expectedProfiles.add(capability);
  }
  assertExactCsv('COMPOSE_PROFILES', environment.COMPOSE_PROFILES, [...expectedProfiles]);
  const expectedServices = new Set([
    ...selection.apps.filter((app) => appCatalog[app].releaseImage !== undefined),
    ...selection.capabilities.flatMap((capability) => capabilityCatalog[capability].dockerServices),
  ]);
  if (!sameValues(expectedServices, new Set(closure.services))) {
    throw new Error('Fresh closure services do not match the configured application and capability services; rerun setup.');
  }
}

export async function runSelectedCompose(workspaceRoot = process.cwd(), composeArgs = process.argv.slice(2)): Promise<void> {
  const environmentPath = resolve(workspaceRoot, '.nrb/capabilities.env');
  const composePath = resolve(workspaceRoot, 'docker/docker-compose.yml');

  if (!existsSync(environmentPath)) {
    throw new Error('No setup selection found. Run `pnpm nrb setup` before `pnpm run docker:selected`.');
  }
  if (!existsSync(composePath)) {
    throw new Error(`Compose file not found: ${composePath}`);
  }

  const { closure } = await loadCurrentSelectedClosure(workspaceRoot);
  const selection = readConfiguredSelection(workspaceRoot);
  const selectedEnvironment = parseGeneratedEnvironment(readFileSync(environmentPath, 'utf8'));
  validateGeneratedSelectionEnvironment(closure, selection, selectedEnvironment);
  const provider = validateSelectedDatabaseEnvironment(closure.provider, selectedEnvironment);
  const commandEnvironment = {
    ...process.env,
    ...selectedEnvironment,
    NRB_CLOSURE_CONTEXT: resolve(workspaceRoot, '.nrb/closure'),
  };
  const services = execFileSync(
    'docker',
    ['compose', '--env-file', environmentPath, '-f', composePath, 'config', '--services'],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: commandEnvironment,
      timeout: 30000,
    },
  )
    .split(/\r?\n/u)
    .filter(Boolean);
  validateSelectedComposeServices(provider, closure.services, services);

  await run(
    'docker',
    ['compose', '--env-file', environmentPath, '-f', composePath, ...(composeArgs.length > 0 ? composeArgs : ['up', '--build'])],
    {
      cwd: workspaceRoot,
      env: commandEnvironment,
      stdio: 'inherit',
    },
  );
}

function csvValues(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
}

function assertExactCsv(name: string, value: string | undefined, expected: readonly string[]): void {
  const actual = csvValues(value);
  if (!sameValues(actual, new Set(expected))) {
    throw new Error(`${name} is stale or contains unselected application/capability profiles; rerun setup.`);
  }
}

function sameValues(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function requiredEnvironmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the selected local database provider.`);
  }
  return value;
}

const invokedDirectly = process.argv[1]?.endsWith('selected.ts') || process.argv[1]?.endsWith('selected.js');
if (invokedDirectly) {
  await runSelectedCompose().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
