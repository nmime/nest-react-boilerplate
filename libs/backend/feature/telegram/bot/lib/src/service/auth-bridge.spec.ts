// @requirements REQ-AUTH-IDENTITY-005
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { TelegramBotIdentity } from '../type';
import { createTelegramAuthBridge, resolveTelegramAuthBridgeConfig } from './auth-bridge';

const secret = 'owned-telegram-bridge-fixture-credential-32-characters';
const profile = {
  userId: '9c720a13-80c9-473a-aa70-e6f9e2d35455',
  tenantId: '00000000-0000-0000-0000-000000000000',
  locale: 'zh',
};
const identity: TelegramBotIdentity = {
  provider: 'telegram',
  channel: 'telegram_bot',
  providerSubject: '100',
  username: 'ada',
  displayName: 'Ada',
  locale: 'en',
  avatarUrl: null,
};

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  check: (url: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Owned bridge fixture did not bind.');
  }
  try {
    await check(`http://127.0.0.1:${address.port}/api/v1/auth/internal/telegram-bot`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done, reject) =>
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          done();
        }
      }),
    );
  }
}

describe('Telegram stateless auth bridge transport', () => {
  it('is opt-in and rejects incomplete, plaintext remote, credential-bearing and production loopback configuration', () => {
    expect(resolveTelegramAuthBridgeConfig({})).toBeUndefined();
    for (const config of [
      { TELEGRAM_BOT_AUTH_URL: 'not-a-url', TELEGRAM_BOT_AUTH_SECRET: secret },
      { TELEGRAM_BOT_AUTH_URL: 'https://auth.example.test/internal' },
      { TELEGRAM_BOT_AUTH_SECRET: secret },
      { TELEGRAM_BOT_AUTH_URL: 'http://remote.example.test', TELEGRAM_BOT_AUTH_SECRET: secret },
      { TELEGRAM_BOT_AUTH_URL: 'https://user:password@auth.example.test', TELEGRAM_BOT_AUTH_SECRET: secret },
      { TELEGRAM_BOT_AUTH_URL: 'https://auth.example.test?token=bad', TELEGRAM_BOT_AUTH_SECRET: secret },
      { TELEGRAM_BOT_AUTH_URL: 'http://127.0.0.1:3003', TELEGRAM_BOT_AUTH_SECRET: secret, NODE_ENV: 'production' },
      { TELEGRAM_BOT_AUTH_URL: 'https://auth.example.test', TELEGRAM_BOT_AUTH_SECRET: 'short' },
    ]) {
      expect(() => resolveTelegramAuthBridgeConfig(config)).toThrow();
    }
    expect(
      resolveTelegramAuthBridgeConfig({
        TELEGRAM_BOT_AUTH_URL: 'https://auth.example.test/api/v1/auth/internal/telegram-bot/',
        TELEGRAM_BOT_AUTH_SECRET: secret,
      })?.url,
    ).toBe('https://auth.example.test/api/v1/auth/internal/telegram-bot');
  });

  it('uses the configured API prefix and service credential; locale ignores cached local ownership hints', async () => {
    const requests: Array<{ path: string; authorization?: string; cookie?: string; body: unknown }> = [];
    await withServer(
      (req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += String(chunk);
        });
        req.on('end', () => {
          requests.push({
            path: req.url!,
            authorization: req.headers.authorization,
            cookie: req.headers.cookie,
            body: JSON.parse(body),
          });
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(profile));
        });
      },
      async (url) => {
        const config = resolveTelegramAuthBridgeConfig({
          TELEGRAM_BOT_AUTH_URL: url,
          TELEGRAM_BOT_AUTH_SECRET: secret,
        })!;
        const auth = createTelegramAuthBridge(config, { appUrl: 'https://app.example.test/telegram-mini-app' });
        expect(await auth.findLinkedUser(identity)).toEqual(profile);
        expect(await auth.consumeLinkPayload(`link_${'a'.repeat(43)}`, identity)).toEqual({
          kind: 'link',
          locale: 'zh',
        });
        expect(await auth.consumeLinkPayload('unrecognized-route', identity)).toBeNull();
        await auth.updateLinkedUserLocale({ identity, locale: 'ru', userId: 'forged', tenantId: 'forged' });
        expect(await auth.createLinkInstructions(identity)).toBe('https://app.example.test/telegram-mini-app');
      },
    );
    expect(requests).toEqual([
      {
        path: '/api/v1/auth/internal/telegram-bot/resolve',
        authorization: `Bearer ${secret}`,
        cookie: undefined,
        body: { providerSubject: '100' },
      },
      {
        path: '/api/v1/auth/internal/telegram-bot/link',
        authorization: `Bearer ${secret}`,
        cookie: undefined,
        body: { providerSubject: '100', linkToken: 'a'.repeat(43) },
      },
      {
        path: '/api/v1/auth/internal/telegram-bot/locale',
        authorization: `Bearer ${secret}`,
        cookie: undefined,
        body: { providerSubject: '100', locale: 'ru' },
      },
    ]);
  });

  it('does not turn an unknown identity into a local account', async () => {
    await withServer(
      (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end('null');
      },
      async (url) => {
        const auth = createTelegramAuthBridge({ url, secret });
        expect(await auth.findLinkedUser(identity)).toBeNull();
        await expect(auth.consumeLinkPayload('a'.repeat(43), identity)).rejects.toThrow('not established');
        await expect(auth.updateLinkedUserLocale({ identity, locale: 'en' })).rejects.toThrow('not saved');
      },
    );
  });

  it.each([
    { ...profile, userId: '100' },
    { ...profile, tenantId: '100' },
    { ...profile, locale: 'unsupported' },
    [profile],
    { secret, session: {} },
    'x'.repeat(8_192),
  ])('rejects malformed or oversized service profiles without exposing transport data', async (payload) => {
    await withServer(
      (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(payload));
      },
      async (url) => {
        await expect(createTelegramAuthBridge({ url, secret }).findLinkedUser(identity)).rejects.toThrow(
          'Telegram account service is unavailable.',
        );
      },
    );
  });

  it('refuses redirects before credentials reach a second endpoint', async () => {
    let redirected = 0;
    await withServer(
      (_req, res) => {
        redirected++;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(profile));
      },
      async (second) => {
        await withServer(
          (_req, res) => {
            res.writeHead(307, { location: second });
            res.end();
          },
          async (first) => {
            await expect(createTelegramAuthBridge({ url: first, secret }).findLinkedUser(identity)).rejects.toThrow(
              'service is unavailable',
            );
          },
        );
      },
    );
    expect(redirected).toBe(0);
  });

  it('bounds an unresponsive real endpoint', async () => {
    await withServer(
      () => {},
      async (url) => {
        await expect(createTelegramAuthBridge({ url, secret }).findLinkedUser(identity)).rejects.toThrow(
          'service is unavailable',
        );
      },
    );
  }, 10_000);
});

describe('bridge failure authority', () => {
  it('normalizes the root endpoint, rejects invalid senders before transport, and has no invented link URL', async () => {
    expect(
      resolveTelegramAuthBridgeConfig({
        TELEGRAM_BOT_AUTH_URL: 'https://auth.example.test///',
        TELEGRAM_BOT_AUTH_SECRET: secret,
      })?.url,
    ).toBe('https://auth.example.test');
    const transport = async () => new Response('null', { headers: { 'content-type': 'application/json' } });
    const auth = createTelegramAuthBridge({ url: 'https://auth.example.test', secret }, { fetch: transport });
    expect(await auth.createLinkInstructions(identity)).toBeNull();
    await expect(auth.findLinkedUser({ ...identity, providerSubject: 'forged-subject' })).rejects.toThrow(
      'Invalid Telegram bot sender',
    );
    const nullLocale = createTelegramAuthBridge(
      { url: 'https://auth.example.test', secret },
      {
        fetch: async () =>
          new Response(JSON.stringify({ ...profile, locale: null }), {
            headers: { 'content-type': 'application/json' },
          }),
      },
    );
    expect(await nullLocale.consumeLinkPayload('a'.repeat(43), identity)).toEqual({ kind: 'link' });
  });

  it.each(['non-json', 'rejected', 'empty'] as const)(
    'refuses %s responses with a generic private error',
    async (kind) => {
      const auth = createTelegramAuthBridge(
        { url: 'https://auth.example.test', secret },
        {
          fetch: async () =>
            kind === 'empty'
              ? new Response(null, { headers: { 'content-type': 'application/json' } })
              : new Response('private response', {
                  status: kind === 'rejected' ? 401 : 200,
                  headers: { 'content-type': kind === 'non-json' ? 'text/plain' : 'application/json' },
                }),
        },
      );
      await expect(auth.findLinkedUser(identity)).rejects.toThrow('Telegram account service is unavailable.');
    },
  );
});
