import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const establishTelegramTmaBetterAuthSession = vi.fn();
const requestTelegramOidcAuthorization = vi.fn();

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return { ...actual, establishTelegramTmaBetterAuthSession, requestTelegramOidcAuthorization };
});

const api = await import('./social-auth-api');

const ok = (data: unknown) => ({ data: { data }, response: new Response(null) });
const makeClient = () => ({
  api: {
    authControllerDiscordAuthorizationRequest: vi.fn().mockResolvedValue(ok({ authorizationUrl: 'https://d' })),
    authControllerTelegramTma: vi.fn().mockResolvedValue(ok({ status: 'authenticated' })),
    authControllerTelegramOidcSession: vi.fn().mockResolvedValue(ok({ status: 'authenticated' })),
    authControllerDiscordCallback: vi.fn().mockResolvedValue(ok({ status: 'linked' })),
    authControllerProviderIdentities: vi.fn().mockResolvedValue(ok({ identities: [] })),
    authControllerUnlinkProviderIdentity: vi.fn().mockResolvedValue(ok({ ok: true })),
  },
  requestOptions: { headers: {} },
});

describe('social-auth-api', () => {
  it('exposes the provider-identities query key', () => {
    expect(Array.isArray(api.providerIdentitiesQueryKey())).toBe(true);
  });

  it('requests Discord authorization', async () => {
    const client = makeClient();
    await expect(api.requestDiscordAuthorization(client as never, { intent: 'login' })).resolves.toEqual({
      authorizationUrl: 'https://d',
    });
    expect(client.api.authControllerDiscordAuthorizationRequest).toHaveBeenCalledWith(
      { intent: 'login' },
      client.requestOptions,
    );
  });

  it('establishes then submits a Telegram Mini App session', async () => {
    const client = makeClient();
    await api.submitTelegramTma(client as never, 'init-data', { intent: 'link' });
    expect(establishTelegramTmaBetterAuthSession).toHaveBeenCalledWith(client.requestOptions, 'init-data');
    expect(client.api.authControllerTelegramTma).toHaveBeenCalledWith(
      { intent: 'link', initData: 'init-data' },
      client.requestOptions,
    );
  });

  it('starts Telegram OIDC with matching callback urls', async () => {
    requestTelegramOidcAuthorization.mockResolvedValue({ url: 'https://oidc' });
    const client = makeClient();
    await expect(api.startTelegramOidc(client as never, 'https://cb')).resolves.toEqual({ url: 'https://oidc' });
    expect(requestTelegramOidcAuthorization).toHaveBeenCalledWith(client.requestOptions, {
      callbackURL: 'https://cb',
      errorCallbackURL: 'https://cb',
    });
  });

  it('submits the OIDC session, discord callback, identities, and unlink', async () => {
    const client = makeClient();
    await expect(api.submitTelegramOidcSession(client as never, { intent: 'login' })).resolves.toEqual({
      status: 'authenticated',
    });
    await expect(api.submitDiscordCallback(client as never, { code: 'c', state: 's' } as never)).resolves.toEqual({
      status: 'linked',
    });
    await expect(api.fetchProviderIdentities(client as never)).resolves.toEqual({ identities: [] });
    await expect(api.unlinkProviderIdentity(client as never, 'id-1')).resolves.toEqual({ ok: true });
    expect(client.api.authControllerUnlinkProviderIdentity).toHaveBeenCalledWith('id-1', client.requestOptions);
  });

  it('never reads unsafe Telegram init data in production code', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'social-auth-api.ts'), 'utf8');
    expect(source).not.toContain('init' + 'DataUnsafe');
  });
});
