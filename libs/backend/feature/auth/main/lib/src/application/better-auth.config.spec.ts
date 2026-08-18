// @requirements REQ-AUTH-ACCESS-001
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { DefaultBetterAuthSessionMaxAgeSeconds, getBetterAuthConfig } from './better-auth';

type AuthInstanceLike = {
  options?: {
    plugins?: Array<{ id?: string; options?: { config?: Array<{ providerId?: string }> } }>;
  };
};

/** Reads the generic-oauth plugin config array off a built Better-Auth instance. */
const telegramOidcProviderConfigs = (auth: AuthInstanceLike): Array<{ providerId?: string }> =>
  auth.options?.plugins?.find((plugin) => plugin?.id === 'generic-oauth')?.options?.config ?? [];

describe('getBetterAuthConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-testing-min-32-chars';
    delete process.env.AUTH_PERSISTENCE;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.API_BASE_URL;
    delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OIDC_CLIENT_ID;
    delete process.env.TELEGRAM_OIDC_CLIENT_SECRET;
    delete process.env.TELEGRAM_OIDC_DISCOVERY_URL;
    delete process.env.TELEGRAM_OIDC_ENABLED;
    delete process.env.TELEGRAM_OIDC_ISSUER;
    delete process.env.TELEGRAM_OIDC_JWKS_URL;
    delete process.env.TELEGRAM_OIDC_SCOPES;
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    delete process.env.DISCORD_REDIRECT_URI;
    delete process.env.ALLOWED_RETURN_URLS;
    delete process.env.NODE_ENV;
    delete process.env.OPENAPI_ENABLED;
    delete process.env.SESSION_COOKIE_MAX_AGE_SECONDS;
    delete process.env.MONGODB_DATABASE;
    delete process.env.MONGODB_REPLICA_SET;
    delete process.env.MONGODB_URI;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('does not resolve provider configuration inside the neutral auth feature', () => {
    delete process.env.DATABASE_URL;
    expect(getBetterAuthConfig(null, {})).toBeDefined();
  });

  it('supports a database-free OpenAPI export', () => {
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

  it('aligns the Better-Auth session lifetime with the first-party session cookie', () => {
    // The default must match the app session cookie (7 days), not a 1h window
    // that expires Better-Auth sessions out from under valid app sessions.
    const defaulted = getBetterAuthConfig(null, {}) as unknown as {
      options: { session?: { expiresIn?: number } };
    };
    expect(defaulted.options.session?.expiresIn).toBe(DefaultBetterAuthSessionMaxAgeSeconds);

    process.env.SESSION_COOKIE_MAX_AGE_SECONDS = '3600';
    const configured = getBetterAuthConfig(null, {}) as unknown as {
      options: { session?: { expiresIn?: number } };
    };
    expect(configured.options.session?.expiresIn).toBe(3600);
  });

  it('prefers an explicit sessionMaxAge option over SESSION_COOKIE_MAX_AGE_SECONDS', () => {
    process.env.SESSION_COOKIE_MAX_AGE_SECONDS = '3600';
    const auth = getBetterAuthConfig(null, { sessionMaxAge: 7200 }) as unknown as {
      options: { session?: { expiresIn?: number } };
    };
    expect(auth.options.session?.expiresIn).toBe(7200);
  });

  it('pins the session default to the bootstrap cookie default', () => {
    // Mirrors the constant-pinning pattern used for the tenant default: read the
    // bootstrap source so the two defaults cannot drift silently.
    const bootstrapSource = readFileSync(
      new URL('../../../../../../common/bootstrap/lib/src/bootstrap-nest-api.ts', import.meta.url),
      'utf8',
    );
    const match = /const DefaultSessionCookieMaxAgeSeconds = ([\d_]+);/u.exec(bootstrapSource);
    expect(match?.[1]?.replace(/_/gu, '')).toBe(String(DefaultBetterAuthSessionMaxAgeSeconds));
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

  it('registers Telegram OIDC when numeric client credentials are complete', () => {
    const auth = getBetterAuthConfig(null, {
      telegramOidcClientId: '123456789',
      telegramOidcClientSecret: 'telegram-client-secret',
      telegramOidcEnabled: true,
      telegramOidcScopes: ['openid', 'profile', 'telegram:bot_access'],
    });

    expect(auth).toBeDefined();
  });

  it('accepts Telegram OIDC scopes in environment-style whitespace form', () => {
    process.env.TELEGRAM_OIDC_CLIENT_ID = '123456789';
    process.env.TELEGRAM_OIDC_CLIENT_SECRET = 'telegram-client-secret';
    process.env.TELEGRAM_OIDC_SCOPES = 'openid profile telegram:bot_access';

    expect(getBetterAuthConfig(null)).toBeDefined();
  });

  it('fails startup for partial or invalid Telegram OIDC credentials', () => {
    expect(() =>
      getBetterAuthConfig(null, {
        telegramOidcClientId: '123456789',
        telegramOidcEnabled: true,
      }),
    ).toThrow('TELEGRAM_OIDC_CLIENT_ID and TELEGRAM_OIDC_CLIENT_SECRET are required');
    expect(() =>
      getBetterAuthConfig(null, {
        telegramOidcClientId: 'not-numeric',
        telegramOidcClientSecret: 'telegram-client-secret',
      }),
    ).toThrow('TELEGRAM_OIDC_CLIENT_ID must be the numeric client ID');
  });

  it('keeps Telegram OIDC disabled when only a placeholder client ID is set', () => {
    const auth = getBetterAuthConfig(null, {
      telegramOidcClientId: '123456789',
    }) as unknown as AuthInstanceLike;

    expect(telegramOidcProviderConfigs(auth)).toEqual([]);
  });

  it('keeps Telegram OIDC disabled when only a client secret is set', () => {
    const auth = getBetterAuthConfig(null, {
      telegramOidcClientSecret: 'telegram-client-secret',
    }) as unknown as AuthInstanceLike;

    expect(telegramOidcProviderConfigs(auth)).toEqual([]);
  });

  it('auto-enables Telegram OIDC when both credentials are set', () => {
    const auth = getBetterAuthConfig(null, {
      telegramOidcClientId: '123456789',
      telegramOidcClientSecret: 'telegram-client-secret',
    }) as unknown as AuthInstanceLike;

    expect(telegramOidcProviderConfigs(auth)).toEqual([expect.objectContaining({ providerId: 'telegram' })]);
  });

  it('keeps Telegram OIDC disabled for an env placeholder client ID without a secret', () => {
    process.env.TELEGRAM_OIDC_CLIENT_ID = '123456789';
    const auth = getBetterAuthConfig(null) as unknown as AuthInstanceLike;

    expect(telegramOidcProviderConfigs(auth)).toEqual([]);
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
