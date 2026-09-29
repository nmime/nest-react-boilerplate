// @requirements REQ-AUTH-IDENTITY-005
import { createServer } from 'node:http';
import { once } from 'node:events';
import { betterAuth } from 'better-auth';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { genericOAuth } from 'better-auth/plugins';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createTelegramOidcConfig } from './telegram-oidc';

describe('Telegram OIDC social-provider runtime', () => {
  it.each(['valid', 'wrong-nonce', 'wrong-audience'] as const)(
    'verifies a complete discovery/code/callback exchange: %s',
    async (outcome) => {
      const { publicKey, privateKey } = await generateKeyPair('ES256');
      const jwk = { ...(await exportJWK(publicKey)), alg: 'ES256', kid: 'telegram-runtime' };
      const database: MemoryDB = { account: [], session: [], user: [], verification: [] };
      const clientId = 'telegram-runtime-client';
      const authOrigin = 'http://localhost:3003';
      const callbackURL = `${authOrigin}/auth/telegram/callback`;
      let issuer = '';
      let nonce = '';
      const exchanges: { authorization?: string; body: URLSearchParams }[] = [];
      const server = createServer((request, response) => {
        void (async () => {
          response.setHeader('content-type', 'application/json');
          if (request.url === '/.well-known/openid-configuration') {
            response.end(
              JSON.stringify({
                issuer,
                authorization_endpoint: `${issuer}/authorize`,
                token_endpoint: `${issuer}/token`,
                jwks_uri: `${issuer}/jwks`,
                response_types_supported: ['code'],
                subject_types_supported: ['public'],
                id_token_signing_alg_values_supported: ['ES256'],
              }),
            );
          } else if (request.url === '/jwks') {
            response.end(JSON.stringify({ keys: [jwk] }));
          } else if (request.url === '/token') {
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            exchanges.push({
              authorization: request.headers.authorization,
              body: new URLSearchParams(Buffer.concat(chunks).toString()),
            });
            const idToken = await new SignJWT({
              name: 'Ada',
              nonce: outcome === 'wrong-nonce' ? 'unrelated-nonce' : nonce,
            })
              .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
              .setSubject('777')
              .setIssuer(issuer)
              .setAudience(outcome === 'wrong-audience' ? 'another-client' : clientId)
              .setIssuedAt()
              .setExpirationTime('5m')
              .sign(privateKey);
            response.end(
              JSON.stringify({
                access_token: 'test-access-token',
                token_type: 'Bearer',
                expires_in: 300,
                id_token: idToken,
              }),
            );
          } else {
            response.statusCode = 404;
            response.end('{}');
          }
        })().catch(() => {
          response.statusCode = 500;
          response.end('{}');
        });
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test provider address');
      issuer = `http://127.0.0.1:${address.port}`;
      try {
        const auth = betterAuth({
          baseURL: authOrigin,
          secret: 'telegram-runtime-secret-at-least-thirty-two-characters',
          database: memoryAdapter(database),
          plugins: [
            genericOAuth({
              config: [
                createTelegramOidcConfig({
                  clientId,
                  clientSecret: 'test-client-secret',
                  issuer,
                  discoveryUrl: `${issuer}/.well-known/openid-configuration`,
                  keyResolver: createLocalJWKSet({ keys: [jwk] }),
                }),
              ],
            }),
          ],
        });
        const start = await auth.handler(
          new Request(`${authOrigin}/api/auth/sign-in/social`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: authOrigin },
            body: JSON.stringify({ provider: 'telegram', callbackURL, disableRedirect: true }),
          }),
        );
        expect(start.status).toBe(200);
        const authorization = new URL(((await start.json()) as { url: string }).url);
        expect(authorization.searchParams.get('redirect_uri')).toBe(`${authOrigin}/api/auth/callback/telegram`);
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
        nonce = authorization.searchParams.get('nonce') ?? '';
        expect(nonce).not.toBe('');
        const state = authorization.searchParams.get('state');
        expect(state).toBeTruthy();
        const cookie = start.headers
          .getSetCookie()
          .map((value) => value.split(';', 1)[0])
          .join('; ');
        const callback = await auth.handler(
          new Request(
            `${authOrigin}/api/auth/callback/telegram?code=test-code&state=${encodeURIComponent(state ?? '')}`,
            {
              headers: { cookie },
            },
          ),
        );
        expect(exchanges).toHaveLength(1);
        expect(exchanges[0]?.body.get('code_verifier')).toBeTruthy();
        expect(exchanges[0]?.authorization).toBe(
          `Basic ${Buffer.from(`${clientId}:test-client-secret`).toString('base64')}`,
        );
        if (outcome === 'valid') {
          expect(callback.headers.get('location')).toBe(callbackURL);
          expect(callback.headers.get('set-cookie')).toContain('better-auth.session_token=');
          expect(database.account).toEqual([expect.objectContaining({ providerId: 'telegram', accountId: '777' })]);
          expect(database.user).toEqual([
            expect.objectContaining({ email: 'telegram-777@telegram.invalid', name: 'Ada' }),
          ]);
        } else {
          expect(callback.headers.get('location')).toContain('error=');
          expect(database.account).toHaveLength(0);
          expect(database.session).toHaveLength(0);
          expect(database.user).toHaveLength(0);
        }
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
  );
});
