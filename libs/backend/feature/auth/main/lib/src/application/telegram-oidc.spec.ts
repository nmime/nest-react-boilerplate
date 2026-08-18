// @requirements REQ-AUTH-IDENTITY-005
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  createTelegramOidcConfig,
  TelegramOidcDiscoveryUrl,
  TelegramOidcIssuer,
  TelegramOidcJwksUrl,
  TelegramOidcProviderId,
  telegramSyntheticEmail,
  verifyTelegramOidcIdToken,
} from './telegram-oidc';

// Records the URL passed to createRemoteJWKSet and swaps in an offline empty
// key set, so the default-JWKS-URL fallback can be asserted without network.
const remoteJwksUrlCalls = vi.hoisted(() => [] as string[]);
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet: ((url: URL | string) => {
      remoteJwksUrlCalls.push(String(url));
      return actual.createLocalJWKSet({ keys: [] });
    }) as typeof actual.createRemoteJWKSet,
  };
});

const clientId = '123456789';

async function signedTelegramIdToken(
  claims: Record<string, unknown> = {},
  input: { audience?: string; issuer?: string } = {},
) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const keyResolver = createLocalJWKSet({ keys: [{ ...jwk, alg: 'ES256', kid: 'telegram-test' }] });
  const subject = typeof claims.sub === 'string' || typeof claims.sub === 'number' ? String(claims.sub) : '777';
  const idToken = await new SignJWT({
    name: 'Ada Lovelace',
    picture: 'https://cdn.example.test/ada.png',
    preferred_username: 'ada',
    ...claims,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'telegram-test' })
    .setIssuer(input.issuer ?? TelegramOidcIssuer)
    .setAudience(input.audience ?? clientId)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  return { idToken, keyResolver };
}

describe('Telegram OIDC', () => {
  it('uses Telegram discovery, authorization code PKCE, and a stable provider id', () => {
    const config = createTelegramOidcConfig({ clientId, clientSecret: 'telegram-client-secret' });

    expect(config).toMatchObject({
      authentication: 'basic',
      clientId,
      discoveryUrl: TelegramOidcDiscoveryUrl,
      issuer: TelegramOidcIssuer,
      pkce: true,
      providerId: TelegramOidcProviderId,
      responseType: 'code',
      scopes: ['openid', 'profile'],
    });
    expect(telegramSyntheticEmail('777')).toBe('telegram-777@telegram.invalid');
  });

  it('verifies the signed ID token and maps Telegram claims to a Better Auth user', async () => {
    const { idToken, keyResolver } = await signedTelegramIdToken();
    const claims = await verifyTelegramOidcIdToken(idToken, { clientId, keyResolver });
    const config = createTelegramOidcConfig({
      clientId,
      clientSecret: 'telegram-client-secret',
      keyResolver,
    });

    expect(claims).toEqual({
      name: 'Ada Lovelace',
      picture: 'https://cdn.example.test/ada.png',
      preferred_username: 'ada',
      sub: '777',
    });
    await expect(config.getUserInfo?.({ idToken } as never)).resolves.toEqual({
      email: 'telegram-777@telegram.invalid',
      emailVerified: false,
      id: '777',
      image: 'https://cdn.example.test/ada.png',
      name: 'Ada Lovelace',
    });
  });

  it('rejects tokens for another client, another issuer, or a non-Telegram subject', async () => {
    const wrongAudience = await signedTelegramIdToken({}, { audience: 'another-client' });
    const wrongIssuer = await signedTelegramIdToken({}, { issuer: 'https://issuer.example.test' });
    const invalidSubject = await signedTelegramIdToken({ sub: 'not-a-telegram-id' });

    await expect(
      verifyTelegramOidcIdToken(wrongAudience.idToken, {
        clientId,
        keyResolver: wrongAudience.keyResolver,
      }),
    ).rejects.toThrow();
    await expect(
      verifyTelegramOidcIdToken(wrongIssuer.idToken, {
        clientId,
        keyResolver: wrongIssuer.keyResolver,
      }),
    ).rejects.toThrow();
    await expect(
      verifyTelegramOidcIdToken(invalidSubject.idToken, {
        clientId,
        keyResolver: invalidSubject.keyResolver,
      }),
    ).rejects.toThrow('invalid_telegram_subject');
  });

  it('does not accept a token response without an ID token', async () => {
    const config = createTelegramOidcConfig({ clientId, clientSecret: 'telegram-client-secret' });

    await expect(config.getUserInfo?.({} as never)).rejects.toThrow('telegram_id_token_missing');
  });

  it('falls back to the default JWKS URL when jwksUrl is empty, whitespace, or undefined', () => {
    for (const jwksUrl of [undefined, '', '   '] as Array<string | undefined>) {
      remoteJwksUrlCalls.length = 0;
      const config = createTelegramOidcConfig({
        clientId,
        clientSecret: 'telegram-client-secret',
        jwksUrl,
      });

      expect(config.providerId).toBe(TelegramOidcProviderId);
      expect(remoteJwksUrlCalls).toEqual([TelegramOidcJwksUrl]);
    }
  });

  it('keeps an explicit jwksUrl when one is provided', () => {
    remoteJwksUrlCalls.length = 0;
    const config = createTelegramOidcConfig({
      clientId,
      clientSecret: 'telegram-client-secret',
      jwksUrl: 'https://keys.example.test/jwks.json',
    });

    expect(config.providerId).toBe(TelegramOidcProviderId);
    expect(remoteJwksUrlCalls).toEqual(['https://keys.example.test/jwks.json']);
  });

  it('resolves the default JWKS URL in token verification when jwksUrl is empty or whitespace', async () => {
    const { idToken } = await signedTelegramIdToken();

    for (const jwksUrl of ['', '   '] as const) {
      remoteJwksUrlCalls.length = 0;
      // No keyResolver is supplied, so the module picks the JWKS URL itself.
      // The offline empty key set rejects the token; the URL selection is the
      // behavior under test.
      await expect(verifyTelegramOidcIdToken(idToken, { clientId, jwksUrl })).rejects.toThrow();
      expect(remoteJwksUrlCalls).toEqual([TelegramOidcJwksUrl]);
    }
  });

  it('keeps an explicit jwksUrl in token verification', async () => {
    const { idToken } = await signedTelegramIdToken();

    remoteJwksUrlCalls.length = 0;
    await expect(
      verifyTelegramOidcIdToken(idToken, {
        clientId,
        jwksUrl: 'https://keys.example.test/jwks.json',
      }),
    ).rejects.toThrow();
    expect(remoteJwksUrlCalls).toEqual(['https://keys.example.test/jwks.json']);
  });
});
