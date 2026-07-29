import { describe, expect, it } from 'vitest';
import { RedisMode } from '@app/backend-common-redis';
import { resolveBackendEnvironmentConfig } from './bootstrap-nest-api';

describe('resolveBackendEnvironmentConfig', () => {
  it('centralizes validated defaults for development APIs', () => {
    const config = resolveBackendEnvironmentConfig(
      { appName: 'test-api', port: 3010 },
      {
        SESSION_SECRET: 'development-secret',
        CORS_ORIGINS: 'https://admin-app.example.com, https://user-app.example.com',
        NODE_ENV: 'development',
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_MAX: '25',
        RATE_LIMIT_WINDOW_MS: '5000',
        SESSION_COOKIE_SECURE: 'false',
        TRUST_PROXY: 'true',
      },
    );

    expect(config).toMatchObject({
      corsOrigins: ['https://admin-app.example.com', 'https://user-app.example.com'],
      isProduction: false,
      port: 3010,
      rateLimit: {
        enabled: true,
        max: 25,
        store: 'memory',
        storePreference: 'auto',
        windowMs: 5000,
      },
      session: {
        cookieName: 'nrb.sid',
        persistence: 'postgres',
        secure: false,
      },
      trustProxy: true,
    });
    expect(config.session.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('uses an in-memory session store for explicit memory auth persistence', () => {
    const config = resolveBackendEnvironmentConfig(
      { appName: 'auth-app-api', port: 3003 },
      {
        AUTH_PERSISTENCE: 'memory',
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
      },
    );

    expect(config.session).not.toHaveProperty('databaseUrl');
    expect(config.session.persistence).toBe('memory');
    expect(config.session).not.toHaveProperty('mongodb');
  });

  it('records the selected durable session provider without importing provider configuration', () => {
    const fromEnvironment = resolveBackendEnvironmentConfig(
      { appName: 'auth-app-api', port: 3003 },
      {
        AUTH_PERSISTENCE: 'mongodb',
        MONGODB_DATABASE: 'auth',
        MONGODB_REPLICA_SET: 'rs0',
        MONGODB_URI: 'mongodb://mongo-a,mongo-b/auth',
      },
    );
    expect(fromEnvironment.session.persistence).toBe('mongodb');
    expect(fromEnvironment.session).not.toHaveProperty('databaseUrl');
    expect(fromEnvironment.session).not.toHaveProperty('mongodb');
  });

  it('rejects an unknown session provider selector', () => {
    const options = { appName: 'auth-app-api', port: 3003 };
    expect(() => resolveBackendEnvironmentConfig(options, { AUTH_PERSISTENCE: 'sqlite' })).toThrow(
      'AUTH_PERSISTENCE must be one of memory, mongodb, or postgres.',
    );
  });

  it('uses Redis rate-limit storage when explicitly configured', () => {
    const config = resolveBackendEnvironmentConfig(
      { appName: 'test-api', port: 3010 },
      {
        SESSION_SECRET: 'x'.repeat(32),
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
        NODE_ENV: 'production',
        RATE_LIMIT_STORE: 'redis',
        REDIS_KEY_PREFIX: 'nrb:',
        REDIS_URL: 'redis://localhost:6379/0',
      },
    );

    expect(config.rateLimit.store).toBe('redis');
    expect(config.rateLimit.redis).toMatchObject({
      keyPrefix: 'nrb:',
      lazyConnect: true,
      mode: RedisMode.Single,
      url: 'redis://localhost:6379/0',
    });
  });

  it('resolves app-specific, generic, and explicit option ports', () => {
    expect(
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          PORT: '4999',
          TEST_API_PORT: '4123',
        },
      ).port,
    ).toBe(4123);

    expect(
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          PORT: '4999',
        },
      ).port,
    ).toBe(4999);

    expect(resolveBackendEnvironmentConfig({ appName: 'test-api', port: 3010 }, {}).port).toBe(3010);
  });

  it('falls back to explicit options.port when no env variable is set', () => {
    const config = resolveBackendEnvironmentConfig(
      { appName: 'test-api', port: 3010 },
      { SESSION_SECRET: 'development-secret' },
    );
    expect(config.port).toBe(3010);
    expect(config.portSource).toBe('configured');
  });

  it('validates app-specific port values', () => {
    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          TEST_API_PORT: 'abc',
        },
      ),
    ).toThrow('TEST_API_PORT must be a positive integer.');
  });

  it('fails closed for production rate limiting without Redis or an explicit safe override', () => {
    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          SESSION_SECRET: 'x'.repeat(32),
          DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'auto',
          REDIS_HOSTS: '',
          REDIS_URL: '',
        },
      ),
    ).toThrow('Production rate limiting requires RATE_LIMIT_STORE=redis');

    expect(
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          SESSION_SECRET: 'x'.repeat(32),
          DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
          NODE_ENV: 'production',
          RATE_LIMIT_IN_MEMORY_ALLOWED: 'true',
        },
      ).rateLimit,
    ).toMatchObject({
      enabled: true,
      store: 'memory',
      storePreference: 'auto',
    });
  });

  it('fails fast for invalid production and rate-limit environment', () => {
    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          SESSION_SECRET: 'x'.repeat(32),
          DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
          NODE_ENV: 'production',
          RATE_LIMIT_ENABLED: 'maybe',
        },
      ),
    ).toThrow('RATE_LIMIT_ENABLED must be a boolean value.');

    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          SESSION_SECRET: 'x'.repeat(32),
          DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'redis',
        },
      ),
    ).toThrow('RATE_LIMIT_STORE=redis requires REDIS_URL or REDIS_HOSTS to be configured.');

    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: 'test-api', port: 3010 },
        {
          SESSION_SECRET: 'x'.repeat(32),
          DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
          NODE_ENV: 'production',
          RATE_LIMIT_STORE: 'redis',
          REDIS_HOSTS: 'redis.example.com:6379',
          REDIS_MODE: 'sentinel',
        },
      ),
    ).toThrow('REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.');
  });
});
