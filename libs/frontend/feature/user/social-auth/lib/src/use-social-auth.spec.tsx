// @requirements REQ-AUTH-IDENTITY-005
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const socialApi = {
  providerIdentitiesQueryKey: () => ['provider-identities'],
  submitTelegramTma: vi.fn(),
  startTelegramOidc: vi.fn(),
  submitTelegramOidcSession: vi.fn(),
  requestDiscordAuthorization: vi.fn(),
  submitDiscordCallback: vi.fn(),
};
const markAuthenticated = vi.fn();
const assign = vi.fn();

vi.mock('./social-auth-api', () => socialApi);
vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return { ...actual, useAuthApiClient: () => ({ api: {}, requestOptions: {} }) };
});
vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();
  return { ...actual, useAuthShellStore: () => ({ markAuthenticated }) };
});

const { useSocialAuth } = await import('./use-social-auth');

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const render = () => {
  const navigate = vi.fn();
  const hook = renderHook(() => useSocialAuth({ navigate }), { wrapper: createWrapper() });
  return { navigate, ...hook };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { origin: 'https://app.local.test', assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSocialAuth finishExternalAuth', () => {
  it('marks authenticated and navigates to a safe return url from the result', async () => {
    socialApi.submitTelegramTma.mockResolvedValue({
      session: { token: 't' },
      returnUrl: '/dashboard',
      status: 'authenticated',
    });
    const { result, navigate } = render();

    result.current.authenticateTelegramTma({ initData: 'init', intent: 'login', returnUrl: '/dashboard' });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
    expect(markAuthenticated).toHaveBeenCalled();
  });

  it('navigates to /profile after authentication without a return url or session', async () => {
    socialApi.submitTelegramTma.mockResolvedValue({ status: 'authenticated' });
    const { result, navigate } = render();

    result.current.authenticateTelegramTma({ initData: 'init', intent: 'login' });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/profile', { replace: true });
    });
    expect(markAuthenticated).not.toHaveBeenCalled();
  });

  it('navigates to /settings after a link via the discord callback', async () => {
    socialApi.submitDiscordCallback.mockResolvedValue({ status: 'linked' });
    const { result, navigate } = render();

    result.current.completeDiscordCallback({ code: 'c', state: 's' } as never);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/settings', { replace: true });
    });
  });

  it('completes the telegram OIDC callback through the shared finisher', async () => {
    socialApi.submitTelegramOidcSession.mockResolvedValue({ status: 'authenticated' });
    const { result, navigate } = render();

    result.current.completeTelegramOidc({ intent: 'login' });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/profile', { replace: true });
    });
  });
});

describe('useSocialAuth redirects', () => {
  it.each([
    ['authorizationUrl', { authorizationUrl: 'https://d/1' }, 'https://d/1'],
    ['redirectUrl', { redirectUrl: 'https://d/2' }, 'https://d/2'],
    ['url', { url: 'https://d/3' }, 'https://d/3'],
  ])('assigns the discord %s redirect', async (_label, payload, expected) => {
    socialApi.requestDiscordAuthorization.mockResolvedValue(payload);
    const { result } = render();

    result.current.continueWithDiscord({ intent: 'login', returnUrl: '/x' });

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(expected);
    });
  });

  it.each([[{}], [null], ['not-an-object'], [{ url: '   ' }]])(
    'does not redirect for a discord payload without a usable url (%s)',
    async (payload) => {
      socialApi.requestDiscordAuthorization.mockResolvedValue(payload);
      const { result } = render();

      result.current.continueWithDiscord({ intent: 'login' });

      await waitFor(() => {
        expect(result.current.discordStatus).toBe('success');
      });
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it('assigns the telegram OIDC authorization url', async () => {
    socialApi.startTelegramOidc.mockResolvedValue({ url: 'https://oidc/authorize' });
    const { result } = render();

    result.current.continueWithTelegram({ intent: 'login' });

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://oidc/authorize');
    });
  });

  it('does not redirect when telegram OIDC returns no url', async () => {
    socialApi.startTelegramOidc.mockResolvedValue({});
    const { result } = render();

    result.current.continueWithTelegram({ intent: 'login' });

    await waitFor(() => {
      expect(result.current.telegramOidcStatus).toBe('success');
    });
    expect(assign).not.toHaveBeenCalled();
  });
});
