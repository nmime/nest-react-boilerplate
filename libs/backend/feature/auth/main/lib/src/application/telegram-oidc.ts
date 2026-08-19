import { APIError } from 'better-auth/api';
import type { GenericOAuthConfig } from 'better-auth/plugins';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const TelegramOidcProviderId = 'telegram';
export const TelegramOidcIssuer = 'https://oauth.telegram.org';
export const TelegramOidcDiscoveryUrl = `${TelegramOidcIssuer}/.well-known/openid-configuration`;
export const TelegramOidcJwksUrl = `${TelegramOidcIssuer}/.well-known/jwks.json`;

const TelegramOidcAlgorithms = ['RS256', 'ES256', 'EdDSA', 'ES256K'];
const TelegramSubjectPattern = /^\d+$/u;

export interface TelegramOidcOptions {
  clientId: string;
  clientSecret: string;
  discoveryUrl?: string;
  issuer?: string;
  jwksUrl?: string;
  keyResolver?: JWTVerifyGetKey;
  scopes?: string[];
}

interface TelegramOidcClaims {
  sub: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export const telegramSyntheticEmail = (subject: string): string => `telegram-${subject}@telegram.invalid`;

export async function verifyTelegramOidcIdToken(
  idToken: string,
  options: Pick<TelegramOidcOptions, 'clientId' | 'issuer' | 'jwksUrl' | 'keyResolver'>,
): Promise<TelegramOidcClaims> {
  const issuer = options.issuer ?? TelegramOidcIssuer;
  const keyResolver =
    options.keyResolver ?? createRemoteJWKSet(new URL(optionalString(options.jwksUrl) ?? TelegramOidcJwksUrl));
  const { payload } = await jwtVerify(idToken, keyResolver, {
    algorithms: TelegramOidcAlgorithms,
    audience: options.clientId,
    issuer,
  });
  const subject = optionalString(payload.sub);
  if (!subject || !TelegramSubjectPattern.test(subject)) {
    throw APIError.fromStatus('UNAUTHORIZED', { message: 'invalid_telegram_subject' });
  }

  return {
    sub: subject,
    name: optionalString(payload.name),
    picture: optionalString(payload.picture),
    preferred_username: optionalString(payload.preferred_username),
  };
}

export function createTelegramOidcConfig(options: TelegramOidcOptions): GenericOAuthConfig {
  const keyResolver =
    options.keyResolver ?? createRemoteJWKSet(new URL(optionalString(options.jwksUrl) ?? TelegramOidcJwksUrl));

  return {
    providerId: TelegramOidcProviderId,
    discoveryUrl: options.discoveryUrl ?? TelegramOidcDiscoveryUrl,
    issuer: options.issuer ?? TelegramOidcIssuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authentication: 'basic',
    pkce: true,
    responseType: 'code',
    scopes: options.scopes?.length ? options.scopes : ['openid', 'profile'],
    async getUserInfo(tokens) {
      if (!tokens.idToken) {
        throw APIError.fromStatus('UNAUTHORIZED', { message: 'telegram_id_token_missing' });
      }
      const claims = await verifyTelegramOidcIdToken(tokens.idToken, {
        clientId: options.clientId,
        issuer: options.issuer,
        jwksUrl: options.jwksUrl,
        keyResolver,
      });
      const username = claims.preferred_username;

      return {
        id: claims.sub,
        email: telegramSyntheticEmail(claims.sub),
        emailVerified: false,
        name: claims.name ?? (username ? `@${username}` : `Telegram user ${claims.sub}`),
        image: claims.picture,
      };
    },
  };
}
