import type { PoolConfig } from 'pg';
import { parseIntoClientConfig } from 'pg-connection-string';
import { readBoolean } from './util/read-env.util';

const TlsQueryKeys = ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'sslnegotiation'];
const TlsModes = new Set(['disable', 'prefer', 'require', 'verify-ca', 'verify-full', 'no-verify']);

function readTlsFlag(value: unknown, name: string): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === undefined || typeof value === 'string') {
    return readBoolean(value, name);
  }
  throw new Error(`${name} must be a boolean value.`);
}

/** One TLS policy for ORM, provider sessions, and application sessions. */
export function createPostgresConnectionOptions(
  databaseUrl?: string,
  env: Readonly<Record<string, unknown>> = process.env,
): PoolConfig {
  let url: URL | undefined;
  if (databaseUrl) {
    try {
      url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('Unsupported protocol');
      }
    } catch {
      // Never embed a credential-bearing URL in a configuration error.
      throw new Error('Invalid PostgreSQL connection URL.');
    }
  }
  const uriMode = url?.searchParams.get('sslmode');
  const environmentMode = typeof env['PGSSLMODE'] === 'string' ? env['PGSSLMODE'].trim() : undefined;
  if ((uriMode && !TlsModes.has(uriMode)) || (environmentMode && !TlsModes.has(environmentMode))) {
    throw new Error('Invalid PostgreSQL TLS mode.');
  }
  const enabled = readTlsFlag(env['POSTGRES_SSL'], 'POSTGRES_SSL') ?? false;
  const rejectUnauthorized =
    readTlsFlag(env['POSTGRES_SSL_REJECT_UNAUTHORIZED'], 'POSTGRES_SSL_REJECT_UNAUTHORIZED') ?? true;
  let ssl: PoolConfig['ssl'];
  let sslnegotiation: string | undefined;
  if (url && TlsQueryKeys.some((key) => url?.searchParams.has(key))) {
    const parsed = parseIntoClientConfig(url.toString());
    ssl = parsed.ssl;
    sslnegotiation = url.searchParams.get('sslnegotiation') ?? undefined;
    if (ssl === undefined) {
      throw new Error('Incomplete PostgreSQL URI TLS policy.');
    }
  } else if (environmentMode) {
    const parsed = parseIntoClientConfig(`postgres://localhost/database?sslmode=${environmentMode}`);
    ssl = parsed.ssl;
  } else {
    ssl = enabled ? { rejectUnauthorized } : false;
  }
  ssl =
    ssl === true
      ? { rejectUnauthorized: true }
      : ssl && typeof ssl === 'object'
        ? { ...ssl, rejectUnauthorized: ssl.rejectUnauthorized ?? true }
        : ssl;
  sslnegotiation ??=
    typeof env['PGSSLNEGOTIATION'] === 'string' ? env['PGSSLNEGOTIATION'].trim() || undefined : undefined;
  if (sslnegotiation !== undefined && sslnegotiation !== 'postgres' && sslnegotiation !== 'direct') {
    throw new Error('Invalid PostgreSQL TLS negotiation policy.');
  }
  if (sslnegotiation === 'direct' && !ssl) {
    throw new Error('Invalid PostgreSQL TLS negotiation policy.');
  }
  // pg otherwise reparses URI TLS keys and replaces the supplied ssl object,
  // including its CA. Pass only the resolved policy to the actual pool.
  for (const key of TlsQueryKeys) {
    url?.searchParams.delete(key);
  }
  return {
    ...(url ? { connectionString: url.toString() } : {}),
    ssl,
    ...(sslnegotiation ? { sslnegotiation } : {}),
  };
}
