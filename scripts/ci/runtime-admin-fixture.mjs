#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

export const RuntimeAdminFixtureEmail = 'admin@example.com';
export const RuntimeAdminFixturePassword = 'Fullstack-admin-fixture-2026!';
const root = resolve(import.meta.dirname, '../..');
const composeFile = resolve(root, 'docker/docker-compose.yml');

/** Never derive write authority from an ambient DATABASE_URL or an external test URL. */
export function ownedFixtureConnection(config, container, workspaceRoot = root) {
  const provider = config.services?.postgres ? 'postgres' : config.services?.mongodb ? 'mongodb' : undefined;
  if (
    !provider ||
    (config.services.postgres && config.services.mongodb) ||
    !config.services['auth-app-api'] ||
    !config.services['admin-app-api']
  )
    throw new Error('Runtime admin fixture requires one owned fullstack database provider.');
  const labels = container.Config?.Labels ?? {};
  const files = (labels['com.docker.compose.project.config_files'] ?? '').split(',').map((file) => resolve(file));
  if (
    !container.State?.Running ||
    labels['com.docker.compose.project'] !== config.name ||
    labels['com.docker.compose.service'] !== provider ||
    files.length !== 1 ||
    files[0] !== resolve(workspaceRoot, 'docker/docker-compose.yml')
  ) {
    throw new Error('Runtime admin fixture database ownership was not established.');
  }
  const definition = config.services[provider];
  const target = provider === 'postgres' ? 5432 : definition.ports?.[0]?.target;
  const bindings = container.NetworkSettings?.Ports?.[`${target}/tcp`];
  if (
    !Array.isArray(bindings) ||
    bindings.length !== 1 ||
    bindings[0].HostIp !== '127.0.0.1' ||
    !/^\d{1,5}$/u.test(bindings[0].HostPort) ||
    Number(bindings[0].HostPort) < 1 ||
    Number(bindings[0].HostPort) > 65535
  ) {
    throw new Error('Runtime admin fixture requires the owned database loopback port.');
  }
  const port = bindings[0].HostPort;
  const environment = definition.environment ?? {};
  if (provider === 'postgres') {
    const url = new URL(`postgres://127.0.0.1:${port}/`);
    url.username = environment.POSTGRES_USER;
    url.password = environment.POSTGRES_PASSWORD;
    url.pathname = `/${environment.POSTGRES_DB}`;
    if (!environment.POSTGRES_USER || !environment.POSTGRES_PASSWORD || !environment.POSTGRES_DB) {
      throw new Error('Owned PostgreSQL fixture credentials are missing.');
    }
    return { provider, uri: url.toString(), database: environment.POSTGRES_DB };
  }
  const database = config.services['auth-app-api'].environment?.MONGODB_DATABASE;
  if (!database || !/^[A-Za-z0-9_-]+$/u.test(database)) throw new Error('Owned MongoDB fixture database is missing.');
  return { provider, uri: `mongodb://mongodb.localhost:${port}/${database}?replicaSet=rs0&retryWrites=true`, database };
}

function dockerJson(args, env) {
  const result = spawnSync('docker', args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Owned runtime fixture Docker inspection failed.');
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Owned runtime fixture Docker inspection was malformed.');
  }
}

export async function seedOwnedRuntimeAdmin(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Runtime admin fixture cannot run in production.');
  const config = dockerJson(['compose', '-f', composeFile, 'config', '--format', 'json'], env);
  const provider = config.services?.postgres ? 'postgres' : 'mongodb';
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'ps', '--quiet', provider], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const ids = result.stdout?.trim().split(/\s+/u).filter(Boolean);
  if (result.error || result.status !== 0 || ids?.length !== 1)
    throw new Error('Owned runtime fixture database is not running.');
  const inspected = dockerJson(['inspect', ids[0]], env);
  if (!Array.isArray(inspected) || inspected.length !== 1)
    throw new Error('Owned runtime fixture database inspection failed.');
  const connection = ownedFixtureConnection(config, inspected[0]);
  const jiti = createJiti(import.meta.url);
  const { buildSeedUsers, DefaultTenantId } = await jiti.import(
    resolve(root, 'packages/tooling/src/commands/db/seed-data.ts'),
  );
  const users = buildSeedUsers(RuntimeAdminFixturePassword, 'en', {
    email: RuntimeAdminFixtureEmail,
    includeDemoUsers: false,
  });
  if (connection.provider === 'postgres') {
    const { seedPostgresDatabase } = await jiti.import(
      resolve(root, 'packages/tooling/src/commands/db/postgres-seed.ts'),
    );
    await seedPostgresDatabase(connection.uri, users);
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      connectionString: connection.uri,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
    try {
      await client.connect();
      const updated = await client.query(
        'UPDATE auth_users SET email_verified_at = now() WHERE id = $1 AND tenant_id = $2 AND email = $3 AND status = $4 RETURNING id',
        [users[0].id, DefaultTenantId, RuntimeAdminFixtureEmail, 'active'],
      );
      if (updated.rowCount !== 1) throw new Error('Owned runtime fixture canonical administrator is unavailable.');
    } finally {
      await client.end();
    }
  } else {
    const { seedMongoDatabase } = await jiti.import(resolve(root, 'packages/tooling/src/commands/db/mongo-seed.ts'));
    await seedMongoDatabase(users, {
      MONGODB_URI: connection.uri,
      MONGODB_DATABASE: connection.database,
      MONGODB_REPLICA_SET: 'rs0',
    });
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(connection.uri, { serverSelectionTimeoutMS: 10_000 });
    try {
      await client.connect();
      const updated = await client
        .db(connection.database)
        .collection('auth_users')
        .updateOne(
          { _id: users[0].id, tenantId: DefaultTenantId, email: RuntimeAdminFixtureEmail, status: 'active' },
          { $set: { emailVerifiedAt: new Date() } },
        );
      if (updated.matchedCount !== 1) throw new Error('Owned runtime fixture canonical administrator is unavailable.');
    } finally {
      await client.close();
    }
  }
  console.log(JSON.stringify({ status: 'seeded-owned-runtime-admin', provider: connection.provider }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const timeout = setTimeout(() => {
    console.error('Owned runtime administrator fixture timed out.');
    process.exit(1);
  }, 90_000);
  try {
    await seedOwnedRuntimeAdmin();
  } catch {
    console.error('Owned runtime administrator fixture failed. Inspect the selected developer stack and migrations.');
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}
