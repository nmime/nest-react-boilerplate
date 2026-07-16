import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './service-options';
import { establishTelegramTmaBetterAuthSession, requestTelegramOidcAuthorization } from './better-auth-telegram';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });

describe('Better Auth Telegram API', () => {
  it('starts Telegram OIDC with a controlled callback and disabled automatic redirect', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ redirect: true, url: 'https://oauth.telegram.org/auth?request=request-id' }));

    await expect(
      requestTelegramOidcAuthorization(
        { baseUrl: 'https://auth-app-api.example.com/', fetchImpl },
        { callbackURL: 'https://user-app.example.com/auth/telegram/callback' },
      ),
    ).resolves.toEqual({ redirect: true, url: 'https://oauth.telegram.org/auth?request=request-id' });

    const [url, options] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://auth-app-api.example.com/api/auth/sign-in/oauth2');
    expect(options).toMatchObject({ credentials: 'include', method: 'POST' });
    expect(JSON.parse(options?.body as string)).toEqual({
      callbackURL: 'https://user-app.example.com/auth/telegram/callback',
      disableRedirect: true,
      errorCallbackURL: 'https://user-app.example.com/auth/telegram/callback',
      providerId: 'telegram',
    });
  });

  it('establishes the TMA Better Auth session with only raw initData and credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '777' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
    );

    await establishTelegramTmaBetterAuthSession(
      { baseUrl: 'https://auth-app-api.example.com', fetchImpl },
      'query_id=signed&hash=verified',
    );

    const [url, options] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://auth-app-api.example.com/api/auth/telegram/tma');
    expect(options?.credentials).toBe('include');
    expect(JSON.parse(options?.body as string)).toEqual({ initData: 'query_id=signed&hash=verified' });
  });

  it('surfaces Better Auth problem responses through the shared typed error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ message: 'invalid_signature' }, 401));

    await expect(
      establishTelegramTmaBetterAuthSession({ baseUrl: 'https://auth-app-api.example.com', fetchImpl }, 'tampered'),
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});
