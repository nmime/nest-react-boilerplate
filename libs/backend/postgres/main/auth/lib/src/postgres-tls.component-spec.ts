// @requirements REQ-RUNTIME-DATABASE-008
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MikroORM, type EntityManager } from '@mikro-orm/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresMikroOrmOptions, PostgresSessionStore } from '@app/backend-postgres-main';
import { AuthPostgresModule } from './auth-postgres.module';

interface ProviderPool {
  readonly database: Pool;
  onApplicationShutdown(): Promise<void>;
}

function providerConstructor(): new () => ProviderPool {
  const providers = Reflect.getMetadata('providers', AuthPostgresModule) as unknown[];
  const provider = providers.find(
    (candidate): candidate is new () => ProviderPool =>
      typeof candidate === 'function' && candidate.name === 'PostgresBetterAuthDatabaseProvider',
  );
  if (!provider) {
    throw new Error('Expected the selected PostgreSQL Better Auth pool owner.');
  }
  return provider;
}

function certificate(directory: string, name: string) {
  const cert = join(directory, `${name}.crt`);
  const key = join(directory, `${name}.key`);
  execFileSync(
    '/usr/bin/openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    ],
    { stdio: 'ignore', timeout: 30_000 },
  );
  return { cert, key };
}

describe('PostgreSQL credential-store TLS', () => {
  let directory: string;
  let trustedCertificate: string;
  let wrongCertificate: string;
  let encrypted: StartedPostgreSqlContainer | undefined;
  let plaintext: StartedPostgreSqlContainer | undefined;
  const originalEnvironment = process.env;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'nrb-postgres-tls-'));
    const trusted = certificate(directory, 'trusted');
    const wrong = certificate(directory, 'wrong');
    trustedCertificate = trusted.cert;
    wrongCertificate = wrong.cert;
    encrypted = await new PostgreSqlContainer('postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24')
      .withCopyFilesToContainer([
        // eslint-disable-next-line sonarjs/publicly-writable-directories -- This absolute path is inside the owned disposable container; only PostgreSQL reads its certificate.
        { source: trusted.cert, target: '/tmp/nrb-server.crt' },
        // eslint-disable-next-line sonarjs/publicly-writable-directories -- The owned container command sets the generated key to postgres-only mode 0600 before startup.
        { source: trusted.key, target: '/tmp/nrb-server.key' },
      ])
      .withCommand([
        'sh',
        '-c',
        'chown postgres:postgres /tmp/nrb-server.crt /tmp/nrb-server.key && chmod 600 /tmp/nrb-server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/nrb-server.crt -c ssl_key_file=/tmp/nrb-server.key',
      ])
      .start();
    plaintext = await new PostgreSqlContainer('postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24').start();
  });

  afterAll(async () => {
    process.env = originalEnvironment;
    try {
      await Promise.all([encrypted?.stop(), plaintext?.stop()]);
    } finally {
      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  const connection = (container: StartedPostgreSqlContainer, ca?: string) => {
    const url = new URL(container.getConnectionUri());
    url.searchParams.set('sslmode', 'verify-full');
    if (ca) {
      url.searchParams.set('sslrootcert', ca);
    }
    return url.toString();
  };

  const orm = (databaseUrl: string) =>
    new MikroORM<EntityManager>({
      ...createPostgresMikroOrmOptions({}, { DATABASE_URL: databaseUrl, POSTGRES_SSL: 'false' }),
      discovery: { warnWhenNoEntities: false },
    });

  it('encrypts ORM, provider-session, and first-party-session connections using the URI CA', async () => {
    if (!encrypted) {
      throw new Error('Owned TLS fixture failed to initialize.');
    }
    const databaseUrl = connection(encrypted, trustedCertificate);
    const database = orm(databaseUrl);
    process.env = { ...originalEnvironment, DATABASE_URL: databaseUrl, POSTGRES_SSL: 'false' };
    const Provider = providerConstructor();
    const provider = new Provider();
    const sessions = new PostgresSessionStore(databaseUrl, 3600, 0, { POSTGRES_SSL: 'false' });
    try {
      const sql = 'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()';
      expect(await database.em.getConnection().execute(sql)).toEqual([{ ssl: true }]);
      expect((await provider.database.query(sql)).rows).toEqual([{ ssl: true }]);
      await sessions.init();
      const count = await provider.database.query<{ count: string }>(
        'SELECT count(*) FROM pg_stat_ssl WHERE ssl AND pid IN (SELECT pid FROM pg_stat_activity WHERE datname = current_database())',
      );
      expect(Number(count.rows[0]?.count)).toBeGreaterThanOrEqual(3);
    } finally {
      await Promise.all([database.close(true), provider.onApplicationShutdown(), sessions.close()]);
      process.env = originalEnvironment;
    }
  });

  it.each(['wrong-ca', 'plaintext-server'] as const)('rejects %s across all three consumers', async (failure) => {
    const container = failure === 'wrong-ca' ? encrypted : plaintext;
    if (!container) {
      throw new Error('Owned TLS fixture failed to initialize.');
    }
    const databaseUrl = connection(container, failure === 'wrong-ca' ? wrongCertificate : trustedCertificate);
    const database = orm(databaseUrl);
    process.env = { ...originalEnvironment, DATABASE_URL: databaseUrl, POSTGRES_SSL: 'false' };
    const Provider = providerConstructor();
    const provider = new Provider();
    const sessions = new PostgresSessionStore(databaseUrl, 3600, 0, { POSTGRES_SSL: 'false' });
    try {
      await expect(database.em.getConnection().execute('SELECT 1')).rejects.toThrow();
      await expect(provider.database.query('SELECT 1')).rejects.toThrow();
      await expect(sessions.init()).rejects.toThrow();
    } finally {
      await Promise.all([database.close(true), provider.onApplicationShutdown(), sessions.close()]);
      process.env = originalEnvironment;
    }
  });
});
