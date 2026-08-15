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
 * One-shot services the database's own healthcheck depends on.
 *
 * MongoDB's healthcheck asks whether the node is a writable primary, and a `--replSet` mongod only
 * becomes one once `rs.initiate()` has run. That makes the bootstrap a *precondition* of health
 * rather than a consumer of it, which is why it cannot be lumped in with the migrator below: gating
 * on health first would wait for a state only a later step can produce.
 */
function bootstrapServices(selection: FullstackSelection): string[] {
  const bootstrap = selection.provider === 'mongodb' ? ['mongodb-init'] : [];
  return bootstrap.filter((service) => selection.services.includes(service));
}

/**
 * The order the stack has to start in: the database, whatever its health depends on, the health gate
 * itself, then the migrator, then everything else.
 *
 * `docker compose up -d` honours `depends_on` ordering but does not wait for a one-shot container to
 * *exit*, so an application whose only declared dependency is the database boots against an
 * unmigrated schema and fails somewhere unrelated. Deriving the order from the selection covers both
 * providers with one rule.
 */
export function fullstackStartupPlan(selection: FullstackSelection): FullstackStartupStep[] {
  const bootstrap = bootstrapServices(selection);
  const migrations = [selection.migrationService].filter((service) => selection.services.includes(service));
  const sequenced = new Set([selection.databaseService, ...bootstrap, ...migrations]);
  const remaining = selection.services.filter((service) => !sequenced.has(service));
  const healthGate: FullstackStartupStep = {
    kind: 'up',
    services: [selection.databaseService],
    waitForHealthy: true,
  };

  // With no bootstrap to run first, the health gate *is* the first start. With one, the database has
  // to be up before the bootstrap can talk to it, so it starts ungated and is gated once after.
  // Compose leaves an already-running container alone, so the second `up` only waits.
  const start: FullstackStartupStep[] =
    bootstrap.length > 0
      ? [
          { kind: 'up', services: [selection.databaseService] },
          ...bootstrap.map((service) => ({ kind: 'run' as const, services: [service] })),
          healthGate,
        ]
      : [healthGate];

  return [
    ...start,
    ...migrations.map((service) => ({ kind: 'run' as const, services: [service] })),
    ...(remaining.length > 0 ? [{ kind: 'up' as const, services: remaining }] : []),
  ];
}

export interface FullstackReadinessProbe {
  service: string;
  /** Path appended to the service's base URL. */
  path: string;
  /** Text the response body must contain before the service counts as ready. */
  marker: string;
}

/**
 * How each service says it is ready, and the text that says so.
 *
 * Every marker is the Compose service name, because that is the one thing about a service a
 * product does not rename. The gate used to read the shipped `<title>` instead -- 'User App',
 * 'Admin App', 'Nest React Boilerplate' -- which the Vite brand transform rewrites from
 * `VITE_PRODUCT_NAME`, so the suite would hang for three minutes and then blame the stack for a
 * rebrand. The SPAs carry the name in `data-app` on the document element, which no brand pass
 * touches; the HTTP services already echo it from their health payload.
 *
 * A service absent from here is started and awaited by Compose but never probed over HTTP, which
 * is right for anything without an HTTP surface (the notification workers, the bots).
 */
const readinessEndpoints: Readonly<Record<string, Omit<FullstackReadinessProbe, 'service'>>> = {
  'admin-app': { path: '/', marker: 'data-app="admin-app"' },
  'admin-app-api': { path: '/health', marker: 'admin-app-api' },
  'auth-app-api': { path: '/health', marker: 'auth-app-api' },
  'landing-app': { path: '/', marker: 'data-app="landing-app"' },
  'site-app': { path: '/ready', marker: 'site-app' },
  'user-app': { path: '/', marker: 'data-app="user-app"' },
  'user-app-api': { path: '/health', marker: 'user-app-api' },
};

export function readinessProbes(selection: FullstackSelection): FullstackReadinessProbe[] {
  return selection.applicationServices.flatMap((service) => {
    const endpoint = readinessEndpoints[service];

    return endpoint ? [{ service, ...endpoint }] : [];
  });
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
