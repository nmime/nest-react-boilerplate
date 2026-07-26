// @requirements REQ-AUTH-IDENTITY-005
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createTelegramOidcConfig,
  TelegramOidcDiscoveryUrl,
  TelegramOidcIssuer,
  TelegramOidcProviderId,
  telegramSyntheticEmail,
  verifyTelegramOidcIdToken,
} from './telegram-oidc';

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
});
