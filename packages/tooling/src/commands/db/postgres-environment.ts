import { isTruthyEnv } from './env-loader.ts';

export function postgresConnectionString(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const host = env.POSTGRES_HOST ?? 'localhost';
  const port = env.POSTGRES_PORT ?? '5432';
  const user = env.POSTGRES_USER ?? 'postgres';
  const password = env.POSTGRES_PASSWORD ?? 'postgres';
  const database = env.POSTGRES_DB ?? 'nest_react_boilerplate';
  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgres://${credentials}@${host}:${port}/${database}`;
}

export function redactedPostgresConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.password) url.password = '***';
  return url.toString();
}

export function isLocalPostgresDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') return false;
  const url = new URL(connectionString);
  const host = normalizedHost(url.host);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  return ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host) &&
    /(^|_)(dev|test|boilerplate)($|_)/u.test(database);
}

export function assertLocalPostgresDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const url = new URL(connectionString);
  const host = normalizedHost(url.host);
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (env.NODE_ENV === 'production' && !isTruthyEnv(env.DB_ALLOW_DESTRUCTIVE)) {
    throw new Error(
      `Refusing destructive database operation while NODE_ENV=production (${host}/${database}). The local host/name heuristic is not trusted here because production uses the same host and db name. Set DB_ALLOW_DESTRUCTIVE=true only for an intentional, controlled operation.`,
    );
  }
  if (!isLocalPostgresDatabase(connectionString, { ...env, NODE_ENV: undefined })) {
    throw new Error(
      `Refusing destructive reset for non-local/dev database ${host}/${database}. Use a disposable local database named with dev/test/boilerplate.`,
    );
  }
}

function normalizedHost(host: string): string {
  if (host.startsWith('[')) return host.slice(1, host.indexOf(']')).toLowerCase();
  return host.replace(/:\d+$/u, '').toLowerCase();
}
