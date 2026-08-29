import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { parseNrbConfig, type NrbConfig } from '../setup/schema.js';
import { emptyState, migrateState, type SetupState } from '../setup/state.js';
import {
  createIdentityManifestConfig,
  defaultConfigPath,
  identityManifestPath,
  isIdentityManifest,
  setupStatePath,
  type IdentityManifest,
} from './engine.js';

export function loadDesiredConfig(workspaceRoot: string, configPath?: string): NrbConfig {
  const path = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(workspaceRoot, configPath)
    : join(workspaceRoot, defaultConfigPath);
  if (!existsSync(path)) throw new Error(`Configuration file not found: ${path}`);
  return parseNrbConfig(JSON.parse(readFileSync(path, 'utf8')));
}

export async function loadIdentityManifest(fs: FilesystemAdapter): Promise<IdentityManifest | null> {
  const content = await fs.read(identityManifestPath);
  if (content === null) return null;
  const raw = JSON.parse(content) as unknown;
  if (!isIdentityManifest(raw)) throw new Error(`${identityManifestPath} is malformed; restore it or pass --force.`);
  return raw;
}

export async function loadSetupState(fs: FilesystemAdapter): Promise<SetupState> {
  const content = await fs.read(setupStatePath);
  if (content === null) return emptyState;
  try {
    return migrateState(JSON.parse(content));
  } catch {
    return emptyState;
  }
}

export function resolvePreviousConfig(desired: NrbConfig, manifest: IdentityManifest | null): NrbConfig {
  return createIdentityManifestConfig(desired, manifest);
}

export function templateBase(workspaceRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function assertCleanGitWorkspace(workspaceRoot: string, force: boolean): void {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot, encoding: 'utf8' });
    if (status.trim() && !force) {
      throw new Error('Refusing to reconfigure with a dirty worktree. Commit/stash changes or pass --force.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing to reconfigure')) throw error;
    if (!force) {
      throw new Error(
        'Refusing to reconfigure because the git worktree status is unknown. Run inside a git checkout or pass --force.',
        { cause: error },
      );
    }
  }
}

export interface TenantChangeGuardOptions {
  databaseUrl?: string;
  mongodbUri?: string;
  mongodbDatabase?: string;
  runPostgresProbe?: (databaseUrl: string) => { status: number | null; stdout: string; stderr: string; error?: Error };
  runMongoProbe?: (mongodbUri: string, database: string) => Promise<'fresh' | 'applied'>;
}

export async function assertTenantChangeAllowed(
  workspaceRoot: string,
  fs: FilesystemAdapter,
  options: TenantChangeGuardOptions = {},
): Promise<void> {
  for (const marker of ['.nrb/seeded', '.nrb/seed.json', '.nrb/seed-state.json']) {
    if (await fs.exists(marker)) {
      throw new Error(
        `Refusing tenant.defaultTenantId rewrite because ${marker} records seeded state. Apply the tenant id with a data migration.`,
      );
    }
  }
  const environment = readEnvironmentFile(workspaceRoot);
  const databaseUrl = firstConfigured(options.databaseUrl, process.env.DATABASE_URL, environment.DATABASE_URL);
  const mongodbUri = firstConfigured(options.mongodbUri, process.env.MONGODB_URI, environment.MONGODB_URI);
  const mongodbDatabase = firstConfigured(
    options.mongodbDatabase,
    process.env.MONGODB_DATABASE,
    environment.MONGODB_DATABASE,
  );
  if (databaseUrl && mongodbUri) {
    throw new Error(
      'Refusing tenant.defaultTenantId rewrite because both PostgreSQL and MongoDB are configured; migration state is ambiguous.',
    );
  }
  if (databaseUrl) {
    await assertFreshPostgresDatabase(databaseUrl, workspaceRoot, options);
    return;
  }
  if (mongodbUri || mongodbDatabase) {
    if (!mongodbUri || !mongodbDatabase) {
      throw new Error(
        'Refusing tenant.defaultTenantId rewrite because MongoDB configuration is incomplete and migration state is unknown.',
      );
    }
    await assertFreshMongoDatabase(mongodbUri, mongodbDatabase, options);
  }
}

async function assertFreshPostgresDatabase(
  databaseUrl: string,
  workspaceRoot: string,
  options: TenantChangeGuardOptions,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'Refusing tenant.defaultTenantId rewrite because DATABASE_URL is malformed and migration state is unknown.',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      `Refusing tenant.defaultTenantId rewrite because DATABASE_URL uses unsupported protocol ${parsed.protocol}; migration state is unknown.`,
    );
  }
  const runProbe =
    options.runPostgresProbe ??
    ((url: string) =>
      spawnSync(
        'psql',
        [
          url,
          '--no-psqlrc',
          '--tuples-only',
          '--no-align',
          '--command',
          "SELECT CASE WHEN to_regclass('public.mikro_orm_migrations') IS NULL THEN 'fresh' WHEN EXISTS (SELECT 1 FROM public.mikro_orm_migrations) THEN 'applied' ELSE 'fresh' END;",
        ],
        { cwd: workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ));
  const result = runProbe(databaseUrl);
  if (result.error) {
    throw new Error(
      `Refusing tenant.defaultTenantId rewrite because DATABASE_URL is configured but migration state could not be checked: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Refusing tenant.defaultTenantId rewrite because DATABASE_URL is reachable only through a failed migration-state probe: ${result.stderr.trim() || `psql exit ${result.status}`}`,
    );
  }
  assertFreshProbeResult(result.stdout.trim());
}

async function assertFreshMongoDatabase(
  mongodbUri: string,
  database: string,
  options: TenantChangeGuardOptions,
): Promise<void> {
  const runProbe =
    options.runMongoProbe ??
    (async (uri: string, databaseName: string): Promise<'fresh' | 'applied'> => {
      // The mongodb driver sits on the selected closure's forbidden-provider package list, so a
      // postgres selection prunes it from node_modules and a literal import (static or dynamic)
      // fails resolution — at CLI boot, because this module is loaded eagerly on every nrb run.
      // Resolve it by name only when a tenant guard actually probes migration state.
      const driver = requireMongoPackage('mongodb') as MongoDriver;
      const client = new driver.MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
      try {
        await client.connect();
        const count = await client.db(databaseName).collection('mongo_migrations').countDocuments({}, { limit: 1 });
        return count > 0 ? 'applied' : 'fresh';
      } finally {
        await client.close();
      }
    });
  const connectionUrlModule = requireMongoPackage('mongodb-connection-string-url') as {
    default?: new (uri: string) => MongoConnectionString;
  };
  const ConnectionString = connectionUrlModule.default ?? (connectionUrlModule as unknown as new (
    uri: string,
  ) => MongoConnectionString);
  let parsed: MongoConnectionString;
  try {
    parsed = new ConnectionString(mongodbUri);
  } catch {
    throw new Error(
      'Refusing tenant.defaultTenantId rewrite because MONGODB_URI is malformed and migration state is unknown.',
    );
  }
  const uriDatabase = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  if (uriDatabase && uriDatabase !== database) {
    throw new Error(
      'Refusing tenant.defaultTenantId rewrite because MONGODB_URI and MONGODB_DATABASE disagree; migration state is unknown.',
    );
  }
  let probe: 'fresh' | 'applied';
  try {
    probe = await runProbe(mongodbUri, database);
  } catch (error) {
    throw new Error(
      `Refusing tenant.defaultTenantId rewrite because MongoDB migration state could not be checked: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  assertFreshProbeResult(probe);
}

/**
 * Shapes of the mongodb driver packages used by the tenant guard.
 *
 * They are structural on purpose: the packages sit on the selected closure's
 * forbidden-provider list, so type references to them would fail `tsc` on a postgres-only
 * closure the same way runtime imports do.
 */
interface MongoConnectionString {
  pathname: string;
}

interface MongoDriver {
  MongoClient: new (
    uri: string,
    options?: { serverSelectionTimeoutMS?: number },
  ) => {
    connect(): Promise<unknown>;
    db(name: string): {
      collection(name: string): {
        countDocuments(query: Record<string, never>, options: { limit: number }): Promise<number>;
      };
    };
    close(): Promise<void> | void;
  };
}

/**
 * Resolve a driver package at call time through the tooling package's own dependency graph.
 *
 * Resolution failures propagate unwrapped so a caller can distinguish "driver not installed"
 * from the domain errors below. An indirect specifier keeps the resolution invisible to the
 * static import smoke check, which must pass on a postgres-only closure without the driver.
 */
function requireMongoPackage(name: string): unknown {
  return createRequire(import.meta.url)(name);
}

function assertFreshProbeResult(probe: string): void {
  if (probe === 'applied') {
    throw new Error(
      'Refusing tenant.defaultTenantId rewrite because the configured database has applied migrations. Apply the tenant id with a data migration.',
    );
  }
  if (probe !== 'fresh') {
    throw new Error(
      `Refusing tenant.defaultTenantId rewrite because the migration-state probe returned an unexpected result: ${probe || '(empty)'}.`,
    );
  }
}

function readEnvironmentFile(workspaceRoot: string): Record<string, string> {
  const path = join(workspaceRoot, '.env');
  if (!existsSync(path)) return {};
  const environment: Record<string, string> = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?<key>[A-Za-z_]\w*)=(?<value>.*)$/u.exec(line);
    if (!match?.groups) continue;
    let value = match.groups.value;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    environment[match.groups.key] = value;
  }
  return environment;
}

function firstConfigured(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}
