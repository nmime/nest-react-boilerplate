import { describe, expect, it } from "vitest";
import { RedisMode } from "@app/common/redis";
import { resolveBackendEnvironmentConfig } from "./bootstrap-nest-api";

describe("resolveBackendEnvironmentConfig", () => {
  it("centralizes validated defaults for development APIs", () => {
    const config = resolveBackendEnvironmentConfig(
      { appName: "test-api", defaultPort: 3010 },
      {
        AUTH_JWT_SECRET: "development-secret",
        CORS_ORIGINS: "https://admin.example.com, https://app.example.com",
        NODE_ENV: "development",
        RATE_LIMIT_ENABLED: "true",
        RATE_LIMIT_MAX: "25",
        RATE_LIMIT_WINDOW_MS: "5000",
        SESSION_COOKIE_SECURE: "false",
        TRUST_PROXY: "true",
      },
    );

    expect(config).toMatchObject({
      corsOrigins: ["https://admin.example.com", "https://app.example.com"],
      isProduction: false,
      port: 3010,
      rateLimit: {
        enabled: true,
        max: 25,
        store: "memory",
        storePreference: "auto",
        windowMs: 5000,
      },
      session: {
        cookieName: "nrb.sid",
        secure: false,
      },
      trustProxy: true,
    });
    expect(config.session.secret.length).toBeGreaterThanOrEqual(32);
  });

  it("uses Redis rate-limit storage when explicitly configured", () => {
    const config = resolveBackendEnvironmentConfig(
      { appName: "test-api", defaultPort: 3010 },
      {
        AUTH_JWT_SECRET: "x".repeat(32),
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
        NODE_ENV: "production",
        RATE_LIMIT_STORE: "redis",
        REDIS_KEY_PREFIX: "nrb:",
        REDIS_URL: "redis://localhost:6379/0",
      },
    );

    expect(config.rateLimit.store).toBe("redis");
    expect(config.rateLimit.redis).toMatchObject({
      keyPrefix: "nrb:",
      lazyConnect: true,
      mode: RedisMode.Single,
      url: "redis://localhost:6379/0",
    });
  });

  it("fails closed for production rate limiting without Redis or an explicit safe override", () => {
    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: "test-api", defaultPort: 3010 },
        {
          AUTH_JWT_SECRET: "x".repeat(32),
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
          NODE_ENV: "production",
          RATE_LIMIT_STORE: "auto",
          REDIS_HOSTS: "",
          REDIS_URL: "",
        },
      ),
    ).toThrow("Production rate limiting requires RATE_LIMIT_STORE=redis");

    expect(
      resolveBackendEnvironmentConfig(
        { appName: "test-api", defaultPort: 3010 },
        {
          AUTH_JWT_SECRET: "x".repeat(32),
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
          NODE_ENV: "production",
          RATE_LIMIT_IN_MEMORY_ALLOWED: "true",
        },
      ).rateLimit,
    ).toMatchObject({
      enabled: true,
      store: "memory",
      storePreference: "auto",
    });
  });

  it("fails fast for invalid production and rate-limit environment", () => {
    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: "test-api", defaultPort: 3010 },
        {
          AUTH_JWT_SECRET: "x".repeat(32),
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
          NODE_ENV: "production",
          RATE_LIMIT_ENABLED: "maybe",
        },
      ),
    ).toThrow("RATE_LIMIT_ENABLED must be a boolean value.");

    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: "test-api", defaultPort: 3010 },
        {
          AUTH_JWT_SECRET: "x".repeat(32),
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
          NODE_ENV: "production",
          RATE_LIMIT_STORE: "redis",
        },
      ),
    ).toThrow(
      "RATE_LIMIT_STORE=redis requires REDIS_URL or REDIS_HOSTS to be configured.",
    );

    expect(() =>
      resolveBackendEnvironmentConfig(
        { appName: "test-api", defaultPort: 3010 },
        {
          AUTH_JWT_SECRET: "x".repeat(32),
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
          NODE_ENV: "production",
          RATE_LIMIT_STORE: "redis",
          REDIS_HOSTS: "redis.example.com:6379",
          REDIS_MODE: "sentinel",
        },
      ),
    ).toThrow(
      "REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.",
    );
  });
});
