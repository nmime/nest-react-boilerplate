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
      } as NodeJS.ProcessEnv,
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
    expect(config.session.secret).toHaveLength(32);
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
      } as NodeJS.ProcessEnv,
    );

    expect(config.rateLimit.store).toBe("redis");
    expect(config.rateLimit.redis).toMatchObject({
      keyPrefix: "nrb:",
      lazyConnect: true,
      mode: RedisMode.Single,
      url: "redis://localhost:6379/0",
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
        } as NodeJS.ProcessEnv,
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
        } as NodeJS.ProcessEnv,
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
        } as NodeJS.ProcessEnv,
      ),
    ).toThrow(
      "REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.",
    );
  });
});
