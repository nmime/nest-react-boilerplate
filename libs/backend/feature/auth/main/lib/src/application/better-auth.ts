import { betterAuth } from 'better-auth';
import type { BetterAuthOptions, Auth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { multiTenantPlugin } from './plugins/multi-tenant';
import { telegramPlugin } from './plugins/telegram';
import { createTelegramOidcConfig } from './telegram-oidc';

export interface BetterAuthConfigOptions {
  secret?: string;
  trustedOrigins?: string[];
  telegramBotToken?: string;
  telegramOidcEnabled?: boolean;
  telegramOidcClientId?: string;
  telegramOidcClientSecret?: string;
  telegramOidcDiscoveryUrl?: string;
  telegramOidcIssuer?: string;
  telegramOidcJwksUrl?: string;
  telegramOidcScopes?: string[];
  discordClientId?: string;
  discordClientSecret?: string;
  discordRedirectUri?: string;
  sessionCookieName?: string;
  sessionMaxAge?: number;
}

export function getBetterAuthConfig(database: unknown, options: BetterAuthConfigOptions = {}): Auth {
  const baseURL = getBaseUrl();
  const telegramOidc = resolveTelegramOidcConfig(options);
  const opts: BetterAuthOptions = {
    database: database as BetterAuthOptions['database'],
    baseURL,
    trustedOrigins: options.trustedOrigins ?? getTrustedOrigins(),

    secret: options.secret ?? process.env.BETTER_AUTH_SECRET,

    socialProviders: {
      discord: {
        clientId: options.discordClientId ?? process.env.DISCORD_CLIENT_ID ?? '',
        clientSecret: options.discordClientSecret ?? process.env.DISCORD_CLIENT_SECRET ?? '',
        redirectURI: options.discordRedirectUri ?? process.env.DISCORD_REDIRECT_URI ?? '',
      },
    },

    session: {
      expiresIn: options.sessionMaxAge ?? 3600,
      updateAge: 600,
    },

    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
      },
      encryptOAuthTokens: true,
      storeStateStrategy: 'database',
    },

    rateLimit: {
      enabled: process.env.NODE_ENV === 'production',
      window: 10,
      max: 100,
    },

    plugins: [
      genericOAuth({ config: telegramOidc ? [telegramOidc] : [] }),
      multiTenantPlugin,
      telegramPlugin({
        botToken: options.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '',
        maxAgeSeconds: readPositiveInteger(process.env.TELEGRAM_TMA_MAX_AGE_SECONDS, 300),
      }),
    ],
  };

  return betterAuth(opts);
}

function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value.trim().toLowerCase() === 'true';
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/u.test(normalized)) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readList(value: string | undefined): string[] | undefined {
  const entries = value
    ?.split(/[\s,]+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries?.length ? entries : undefined;
}

function resolveTelegramOidcConfig(options: BetterAuthConfigOptions) {
  const clientId = options.telegramOidcClientId ?? process.env.TELEGRAM_OIDC_CLIENT_ID ?? '';
  const clientSecret = options.telegramOidcClientSecret ?? process.env.TELEGRAM_OIDC_CLIENT_SECRET ?? '';
  const explicitlyEnabled = options.telegramOidcEnabled ?? readBoolean(process.env.TELEGRAM_OIDC_ENABLED) ?? false;
  const enabled = explicitlyEnabled || Boolean(clientId || clientSecret);
  if (!enabled) {
    return undefined;
  }
  if (!clientId || !clientSecret) {
    throw new Error(
      'TELEGRAM_OIDC_CLIENT_ID and TELEGRAM_OIDC_CLIENT_SECRET are required when Telegram OIDC is enabled',
    );
  }
  if (!/^\d+$/u.test(clientId)) {
    throw new Error('TELEGRAM_OIDC_CLIENT_ID must be the numeric client ID issued by Telegram');
  }

  return createTelegramOidcConfig({
    clientId,
    clientSecret,
    discoveryUrl: options.telegramOidcDiscoveryUrl ?? process.env.TELEGRAM_OIDC_DISCOVERY_URL,
    issuer: options.telegramOidcIssuer ?? process.env.TELEGRAM_OIDC_ISSUER,
    jwksUrl: options.telegramOidcJwksUrl ?? process.env.TELEGRAM_OIDC_JWKS_URL,
    scopes: options.telegramOidcScopes ?? readList(process.env.TELEGRAM_OIDC_SCOPES),
  });
}

export function getBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? process.env.API_BASE_URL ?? 'http://localhost:3003';
}

export function getTrustedOrigins(): string[] {
  const configured = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').filter(Boolean);
  if (configured?.length) {
    return configured;
  }
  return [getBaseUrl()];
}
