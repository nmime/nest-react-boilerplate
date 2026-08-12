import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type FullstackDatabaseProvider = 'mongodb' | 'postgres';

export interface FullstackClosureLike {
  provider: FullstackDatabaseProvider | null;
  roots: string[];
  services: string[];
}

export interface FullstackSelection {
  provider: FullstackDatabaseProvider;
  applicationServices: string[];
  services: string[];
  profiles: string[];
  migrationService: 'migrate' | 'mongodb-migrate';
  databaseService: 'postgres' | 'mongodb';
}

export function readFullstackSelection(workspaceRoot: string): FullstackSelection {
  const closurePath = join(workspaceRoot, '.nrb', 'closure.json');
  if (!existsSync(closurePath)) {
    throw new Error('Fullstack e2e requires a selected .nrb/closure.json; run setup and closure install first.');
  }
  const raw = JSON.parse(readFileSync(closurePath, 'utf8')) as Partial<FullstackClosureLike>;
  if (!Array.isArray(raw.roots) || !Array.isArray(raw.services)) {
    throw new Error('Fullstack e2e selected closure is invalid; rerun setup.');
  }
  return resolveFullstackSelection({
    provider: raw.provider ?? null,
    roots: raw.roots,
    services: raw.services,
  });
}

export function resolveFullstackSelection(closure: FullstackClosureLike): FullstackSelection {
  if (!closure.roots.includes('fullstack-e2e')) {
    throw new Error('Fullstack e2e requires fullstack-e2e in the fresh selected closure.');
  }
  if (closure.provider !== 'postgres' && closure.provider !== 'mongodb') {
    throw new Error('Fullstack e2e requires an explicitly selected PostgreSQL or MongoDB provider.');
  }
  const databaseService = closure.provider;
  const migrationService = closure.provider === 'mongodb' ? 'mongodb-migrate' : 'migrate';
  for (const required of [databaseService, migrationService]) {
    if (!closure.services.includes(required)) {
      throw new Error(`Fullstack e2e closure is missing selected service "${required}".`);
    }
  }
  const applicationServices = closure.roots.filter(
    (project) => project !== 'fullstack-e2e' && closure.services.includes(project),
  );
  const profiles = new Set<string>();
  for (const service of closure.services) {
    profiles.add(profileForService(service));
  }
  return {
    provider: closure.provider,
    applicationServices,
    services: [...closure.services],
    profiles: [...profiles].sort((left, right) => left.localeCompare(right)),
    migrationService,
    databaseService,
  };
}

export interface FullstackStartupStep {
  /** `up` starts long-lived services; `run` executes one one-shot service and waits for it to exit. */
  kind: 'up' | 'run';
  services: string[];
  /** Only meaningful for `up`: hold until every started service reports healthy. */
  waitForHealthy?: boolean;
}

/**
 * One-shot services that must finish before anything else starts, in the order they must finish in.
 *
 * The replica-set bootstrap is MongoDB's alone; the migrator is named by the selection, so a
 * provider added later contributes its own without touching this list.
 */
function preparationServices(selection: FullstackSelection): string[] {
  const bootstrap = selection.provider === 'mongodb' ? ['mongodb-init'] : [];
  return [...bootstrap, selection.migrationService].filter((service) => selection.services.includes(service));
}

/**
 * The order the stack has to start in: the database, held until it is healthy, then each one-shot
 * preparation service in turn, then everything else.
 *
 * `docker compose up -d` honours `depends_on` ordering but does not wait for a one-shot container to
 * *exit*, so an application whose only declared dependency is the database boots against an
 * unmigrated schema and fails somewhere unrelated. Only the MongoDB lane used to be sequenced, and
 * it was sequenced by hand in the compose driver, which left PostgreSQL racing its own migrator.
 * Deriving the order from the selection covers both providers with one rule.
 */
export function fullstackStartupPlan(selection: FullstackSelection): FullstackStartupStep[] {
  const oneShots = preparationServices(selection);
  const sequenced = new Set([selection.databaseService, ...oneShots]);
  const remaining = selection.services.filter((service) => !sequenced.has(service));

  return [
    { kind: 'up', services: [selection.databaseService], waitForHealthy: true },
    ...oneShots.map((service) => ({ kind: 'run' as const, services: [service] })),
    ...(remaining.length > 0 ? [{ kind: 'up' as const, services: remaining }] : []),
  ];
}

export function validateFullstackEnvironment(selection: FullstackSelection, environment: NodeJS.ProcessEnv): void {
  for (const name of ['DATABASE_ENGINE', 'AUTH_PERSISTENCE'] as const) {
    const value = environment[name]?.trim();
    if (value && value !== selection.provider) {
      throw new Error(`${name} conflicts with the ${selection.provider} provider in the fresh selected closure.`);
    }
  }
  const configuredProfiles = csvValues(environment.COMPOSE_PROFILES);
  if (configuredProfiles.size > 0 && !sameValues(configuredProfiles, new Set(selection.profiles))) {
    throw new Error('COMPOSE_PROFILES contains stale or unselected fullstack services; rerun setup.');
  }
  if (environment.FULLSTACK_CRITICAL_ONLY || environment.FULLSTACK_API_CRITICAL_ONLY) {
    throw new Error('Fullstack service reduction flags are unsupported; select the intended apps through setup.');
  }
  const staleKeys =
    selection.provider === 'mongodb'
      ? ['DATABASE_URL', 'CONTAINER_DATABASE_URL']
      : ['MONGODB_URI', 'MONGODB_DATABASE', 'MONGODB_REPLICA_SET'];
  if (staleKeys.some((key) => environment[key]?.trim())) {
    throw new Error(`Fullstack environment contains opposite-provider values for selected ${selection.provider}.`);
  }
}

function profileForService(service: string): string {
  if (service === 'migrate' || service === 'postgres') {
    return 'postgres';
  }
  if (service === 'mongodb' || service === 'mongodb-init' || service === 'mongodb-migrate') {
    return 'mongodb';
  }
  if (service === 'minio') {
    return 's3';
  }
  return service;
}

function csvValues(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function sameValues(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
