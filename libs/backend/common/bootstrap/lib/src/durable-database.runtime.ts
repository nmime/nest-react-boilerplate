import type { FastifySessionObject as Session } from '@fastify/session';
import type { HealthIndicator } from '@app/backend-common-health';

export type DurableDatabaseProviderId = 'mongodb' | 'postgres';

export type SessionStoreCallback = (error?: unknown) => void;
export type SessionStoreGetCallback = (error: unknown, session?: Session | null) => void;

export interface BackendSessionStore {
  close(): Promise<void>;
  destroy(sessionId: string, callback: SessionStoreCallback): void;
  get(sessionId: string, callback: SessionStoreGetCallback): void;
  init(): Promise<void>;
  set(sessionId: string, session: Session, callback: SessionStoreCallback): void;
}

export interface BackendSessionStoreOptions {
  defaultMaxAgeSeconds: number;
  env: NodeJS.ProcessEnv;
  sweepIntervalMs: number;
}

export interface DurableDatabaseRuntime {
  readonly healthIndicators: readonly HealthIndicator[];
  readonly provider: DurableDatabaseProviderId;
  createSessionStore(options: BackendSessionStoreOptions): BackendSessionStore;
}

export const DurableDatabaseRuntimeInjectToken = Symbol('DurableDatabaseRuntimeInjectToken');

export function assertDurableDatabaseEnvironment(
  provider: DurableDatabaseProviderId,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const databaseEngine = normalizedProvider(env.DATABASE_ENGINE);
  const authPersistence = normalizedProvider(env.AUTH_PERSISTENCE);

  if (env.NODE_ENV === 'production' && (!databaseEngine || !authPersistence)) {
    throw new Error('DATABASE_ENGINE and AUTH_PERSISTENCE must identify the compiled durable database provider.');
  }
  if (databaseEngine && databaseEngine !== provider) {
    throw new Error(`DATABASE_ENGINE=${databaseEngine} does not match the compiled ${provider} provider.`);
  }
  if (authPersistence && authPersistence !== provider) {
    throw new Error(`AUTH_PERSISTENCE=${authPersistence} does not match the compiled ${provider} provider.`);
  }
}

export function completeSessionGet(promise: Promise<Session | null>, callback: SessionStoreGetCallback): void {
  void promise
    .then((session) => {
      callback(null, session);
    })
    .catch((error: unknown) => {
      callback(error);
    });
}

export function completeSessionMutation(promise: Promise<void>, callback: SessionStoreCallback): void {
  void promise
    .then(() => {
      callback();
    })
    .catch((error: unknown) => {
      callback(error);
    });
}

export function serializeSession(session: Session): Session {
  return JSON.parse(JSON.stringify(session)) as Session;
}

export function reviveSession(session: Session): Session {
  const cookie = session.cookie as Session['cookie'] & { expires?: Date | string | null };
  if (cookie.expires && !(cookie.expires instanceof Date)) {
    const expires = new Date(cookie.expires);
    if (!Number.isNaN(expires.getTime())) {
      cookie.expires = expires;
    }
  }
  return session;
}

export function resolveSessionExpiry(session: Session, defaultMaxAgeSeconds: number): Date {
  const cookie = session.cookie as Session['cookie'] & { expires?: Date | string | null };
  if (cookie.expires) {
    const expires = cookie.expires instanceof Date ? cookie.expires : new Date(cookie.expires);
    if (!Number.isNaN(expires.getTime())) {
      return expires;
    }
  }

  let configuredMaxAge = defaultMaxAgeSeconds * 1000;
  if (typeof cookie.originalMaxAge === 'number' && cookie.originalMaxAge > 0) {
    configuredMaxAge = cookie.originalMaxAge;
  } else if (typeof cookie.maxAge === 'number' && cookie.maxAge > 0) {
    configuredMaxAge = cookie.maxAge;
  }
  return new Date(Date.now() + configuredMaxAge);
}

function normalizedProvider(value: string | undefined): DurableDatabaseProviderId | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'memory') {
    return undefined;
  }
  if (normalized !== 'mongodb' && normalized !== 'postgres') {
    throw new Error('DATABASE_ENGINE and AUTH_PERSISTENCE must be one of postgres or mongodb.');
  }
  return normalized;
}
