// @requirements REQ-AUTH-PERSISTENCE-007
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const end = vi.fn(() => Promise.resolve());
  const pool = { end };
  return {
    end,
    pool,
    Pool: vi.fn(function PoolMock() {
      return pool;
    }),
  };
});

vi.mock('pg', () => ({ Pool: mocks.Pool }));

import { AuthPostgresModule } from './auth-postgres.module';

interface BetterAuthProviderLifecycle {
  readonly database: unknown;
  onApplicationShutdown(): Promise<void>;
}

function providerConstructor(): new () => BetterAuthProviderLifecycle {
  const providers = Reflect.getMetadata('providers', AuthPostgresModule) as unknown[];
  const provider = providers.find(
    (candidate): candidate is new () => BetterAuthProviderLifecycle =>
      typeof candidate === 'function' && candidate.name === 'PostgresBetterAuthDatabaseProvider',
  );
  if (!provider) {
    throw new Error('Expected the Better Auth PostgreSQL provider.');
  }
  return provider;
}

describe('AuthPostgresModule Better Auth adapter', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
    vi.clearAllMocks();
  });

  it('owns and closes the selected PostgreSQL pool', async () => {
    process.env = { ...originalEnvironment, DATABASE_URL: 'postgres://database/app' };
    const Provider = providerConstructor();
    const provider = new Provider();

    expect(mocks.Pool).toHaveBeenCalledWith({ connectionString: 'postgres://database/app' });
    expect(provider.database).toBe(mocks.pool);
    await provider.onApplicationShutdown();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('requires a database URL except during OpenAPI export', () => {
    process.env = { ...originalEnvironment };
    delete process.env.DATABASE_URL;
    delete process.env.OPENAPI_ENABLED;
    const Provider = providerConstructor();

    expect(() => new Provider()).toThrow('DATABASE_URL is required for Better-Auth PostgreSQL persistence.');
    process.env.OPENAPI_ENABLED = 'true';
    expect(new Provider().database).toBeUndefined();
  });
});
