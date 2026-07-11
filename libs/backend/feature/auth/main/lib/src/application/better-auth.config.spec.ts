import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getBetterAuthConfig } from './better-auth';

describe('getBetterAuthConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-testing-min-32-chars';
    delete process.env.BETTER_AUTH_URL;
    delete process.env.API_BASE_URL;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_REDIRECT_URI;
    delete process.env.ALLOWED_RETURN_URLS;
    delete process.env.NODE_ENV;
    delete process.env.OPENAPI_ENABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('requires DATABASE_URL for normal runtime startup', () => {
    delete process.env.DATABASE_URL;
    expect(() => getBetterAuthConfig(null, {})).toThrow('DATABASE_URL is required');
  });

  it('uses Better-Auth memory persistence only during OpenAPI export', () => {
    delete process.env.DATABASE_URL;
    process.env.OPENAPI_ENABLED = 'true';
    expect(getBetterAuthConfig(null, {})).toBeDefined();
  });

  it('creates a valid Better-Auth instance with defaults', () => {
    const auth = getBetterAuthConfig(null, {});
    expect(auth).toBeDefined();
    expect((auth as any).api).toBeDefined();
  });

  it('uses BETTER_AUTH_SECRET when provided', () => {
    const auth = getBetterAuthConfig(null, {
      secret: 'test-secret-placeholder-min-32-chars-long',
    });
    expect(auth).toBeDefined();
  });

  it('uses custom session options', () => {
    const auth = getBetterAuthConfig(null, {
      sessionMaxAge: 7200,
    });
    expect(auth).toBeDefined();
  });

  it('uses custom trusted origins', () => {
    const auth = getBetterAuthConfig(null, {
      trustedOrigins: ['http://custom.origin.com'],
    });
    expect(auth).toBeDefined();
  });

  it('uses telegram bot token', () => {
    const auth = getBetterAuthConfig(null, {
      telegramBotToken: '123456:ABC-DEF',
    });
    expect(auth).toBeDefined();
  });

  it('uses discord provider options', () => {
    const auth = getBetterAuthConfig(null, {
      discordClientId: 'discord-id',
      discordClientSecret: 'discord-secret',
      discordRedirectUri: 'http://localhost:3003/callback/discord',
    });
    expect(auth).toBeDefined();
  });
});

describe('better-auth-api.controller', () => {
  it('exports BetterAuthApiController class', async () => {
    const { BetterAuthApiController } = await import('./better-auth-api.controller');
    expect(BetterAuthApiController).toBeDefined();
    expect(typeof BetterAuthApiController).toBe('function');
  });

  it('exports BetterAuthInstanceToken token from module', async () => {
    const { BetterAuthInstanceToken } = await import('./better-auth.module');
    expect(BetterAuthInstanceToken).toBe('BetterAuthInstanceToken');
  });
});
