import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './app';

const sourceRoot = resolve(import.meta.dirname, '..');

vi.mock('@tma.js/sdk-react', async () => {
  const actual = await vi.importActual<typeof import('@tma.js/sdk-react')>('@tma.js/sdk-react');
  const availableMethod = Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) });
  const headerColorMethod = Object.assign(vi.fn(), {
    isAvailable: vi.fn(() => true),
    supports: vi.fn(() => true),
  });
  const requestFullscreen = Object.assign(
    vi.fn(() => Promise.resolve()),
    {
      isAvailable: vi.fn(() => true),
    },
  );
  const retrieveRawInitData = vi.fn(() => undefined);
  return {
    ...actual,
    backButton: {
      hide: vi.fn(),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
      onClick: vi.fn(() => vi.fn()),
      show: vi.fn(),
    },
    init: vi.fn(),
    isTMA: vi.fn(() => false),
    retrieveRawInitData,
    miniApp: {
      bindCssVars: vi.fn(() => vi.fn()),
      isCssVarsBound: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
      ready: vi.fn(),
      setBgColor: availableMethod,
      setBottomBarColor: availableMethod,
      setHeaderColor: headerColorMethod,
    },
    shareURL: vi.fn(),
    swipeBehavior: {
      disableVertical: availableMethod(),
      enableVertical: availableMethod(),
      isMounted: vi.fn(() => false),
      isSupported: vi.fn(() => true),
      mount: vi.fn(),
      unmount: vi.fn(),
    },
    themeParams: {
      bindCssVars: vi.fn(() => vi.fn()),
      isCssVarsBound: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
    },
    useLaunchParams: vi.fn(() => ({})),
    useRawInitData: retrieveRawInitData,
    viewport: {
      bindCssVars: vi.fn(() => vi.fn()),
      expand: vi.fn(),
      isCssVarsBound: vi.fn(() => false),
      isFullscreen: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(() => Promise.resolve()),
      requestFullscreen,
    },
  };
});

const tma = vi.mocked(await import('@tma.js/sdk-react'));

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
    statusText: ok ? 'OK' : 'Error',
  });

const deferredResponse = () => {
  let resolveResponse!: (value: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return { promise, resolve: resolveResponse };
};

const setFetch = (...responses: Response[]) => {
  const queue = [...responses];
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (pathname === '/auth/me') {
      return Promise.resolve(jsonResponse({}, false, 401));
    }
    const response = queue.shift();
    return response ? Promise.resolve(response) : Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const resetPath = (path = '/') => {
  window.history.replaceState(null, '', path);
};

describe('social auth and TMA UI', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_AUTH_API_BASE_URL', 'https://auth-api');
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api');
    vi.stubEnv('VITE_TELEGRAM_AUTH_ENABLED', 'true');
    vi.stubEnv('VITE_API_BASE_URL_MODE', undefined);
    tma.useLaunchParams.mockReturnValue({});
    tma.useRawInitData.mockReturnValue(undefined);
    tma.isTMA.mockReturnValue(false);
    resetPath();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetPath();
  });

  it.each(['/tma', '/tma/auth', '/telegram-mini-app'])(
    'shows a localized TMA fallback outside Telegram on %s without crashing',
    async (path) => {
      resetPath(path);
      tma.useRawInitData.mockReturnValue(undefined);

      render(<App />);

      expect(await screen.findByText('Open this page inside Telegram to continue.')).toBeTruthy();
      expect(
        screen.getByText(
          'Telegram provides the secure launch context; the same screen remains understandable when opened in a regular browser.',
        ),
      ).toBeTruthy();
    },
  );

  it('turns Telegram SDK launch-data errors into the browser fallback state', async () => {
    resetPath('/tma');
    tma.retrieveRawInitData.mockImplementationOnce(() => {
      throw new Error('launch parameters unavailable');
    });

    render(<App />);

    expect(await screen.findByText('Open this page inside Telegram to continue.')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeFalsy();
  });

  it('negotiates fullscreen colored Telegram chrome with native back and share controls', async () => {
    resetPath('/tma?startapp=profile');
    tma.isTMA.mockReturnValue(true);

    render(<App />);

    await screen.findAllByRole('button', { name: 'Share' });
    const shell = document.querySelector<HTMLElement>('.xr-mini-app-shell');
    expect(shell?.dataset.miniAppEnvironment).toBe('telegram');
    expect(document.querySelector('.xr-header')).toBeTruthy();
    expect(document.querySelector('.xr-mini-app-bottom-bar')).toBeTruthy();
    await waitFor(() => {
      expect(tma.viewport.requestFullscreen).toHaveBeenCalledOnce();
    });
    expect(tma.miniApp.setHeaderColor).toHaveBeenCalledWith('#2563eb');
    expect(tma.miniApp.setBottomBarColor).toHaveBeenCalledWith('#0f172a');
    expect(tma.backButton.onClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getAllByRole('button', { name: 'Share' })[0]);
    expect(tma.shareURL).toHaveBeenCalledWith(
      'https://app.local.test/tma?startapp=profile',
      'Sign in, review your profile, and manage preferences across web and Telegram.',
    );
    act(() => {
      tma.backButton.onClick.mock.calls[0]?.[0]();
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
  });

  it('uses browser back and Web Share from the same shell outside Telegram', async () => {
    resetPath('/profile?tgWebAppData=secret&ref=friend');
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Back' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Share' })[0]);
    await waitFor(() => {
      expect(share).toHaveBeenCalledOnce();
    });
    expect(share).toHaveBeenCalledWith({
      text: 'Sign in, review your profile, and manage preferences across web and Telegram.',
      title: 'Nest React Boilerplate',
      url: 'https://app.local.test/profile?ref=friend',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
  });

  it('uses same-origin API URLs for Telegram Mini App verification when configured', async () => {
    resetPath('/telegram-mini-app');
    vi.stubEnv('VITE_API_BASE_URL_MODE', 'same-origin');
    vi.stubEnv('VITE_AUTH_API_BASE_URL', undefined);
    vi.stubEnv('VITE_USER_API_BASE_URL', undefined);
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=same-origin');
    const fetchMock = setFetch(jsonResponse({}, false, 409));

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    expect(fetchMock.mock.calls).toHaveLength(1);
    const input = fetchMock.mock.calls[0]?.[0];
    const url = input instanceof Request ? input.url : String(input);
    expect(new URL(url, window.location.origin).pathname).toBe('/api/auth/telegram/tma');
    expect(new URL(url, window.location.origin).pathname).not.toBe('/');
  });

  it('keeps Telegram auth on the launch route when verification fails', async () => {
    resetPath('/tma/auth');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=bad');
    tma.useLaunchParams.mockReturnValue({ tgWebAppStartParam: 'settings' });
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 401),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 401.')).toBeTruthy();
    expect(window.location.pathname).toBe('/tma/auth');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/auth/telegram/tma'),
      ),
    ).toBe(true);
  });

  it('submits Telegram Mini App auth through the documented /telegram-mini-app route', async () => {
    resetPath('/telegram-mini-app');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=route');
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 409),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    expect(window.location.pathname).toBe('/telegram-mini-app');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/auth/telegram/tma'),
      ),
    ).toBe(true);
  });

  it('shows Telegram verification loading until the backend responds', async () => {
    resetPath('/tma/auth');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=hash');
    const pending = deferredResponse();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Loading Telegram Mini App…')).toBeTruthy();
    pending.resolve(jsonResponse({}, false, 409));
    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
  });

  it('submits raw TMA initData to backend, stores session, and navigates', async () => {
    resetPath('/tma/auth?startapp=profile');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=hash');
    tma.useLaunchParams.mockReturnValue({ tgWebAppStartParam: 'profile' });
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({
        data: {
          returnUrl: `${window.location.origin}/profile?from=tma`,
          session: {
            user: {
              email: 'telegram@example.com',
              id: 'user-id',
              permissions: [],
              roles: [],
              tenantId: 'tenant-id',
              theme: 'system',
            },
          },
          status: 'authenticated',
        },
      }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { profile: { email: 'telegram@example.com' } } }),
    );

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
      expect(window.location.search).toBe('?from=tma');
    });
    const tmaCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/tma';
    });
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? '{}';
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({
      initData: 'query_id=raw&hash=hash',
      returnUrl: `${window.location.origin}/profile`,
    });
    expect(Object.hasOwn(body, 'init' + 'DataUnsafe')).toBe(false);
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !(input instanceof Request) || input.headers.get('authorization') === null,
      ),
    ).toBe(true);
  });

  it('starts Telegram link flow from /link/telegram instead of generic settings', async () => {
    resetPath('/link/telegram');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=link');
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 409),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    const tmaCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/tma';
    });
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? '{}';
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({
      initData: 'query_id=raw&hash=link',
      intent: 'link',
      returnUrl: `${window.location.origin}/settings`,
    });
  });

  it('parses TMA startapp link_telegram as a link intent', async () => {
    resetPath('/tma?startapp=link_telegram');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=startapp');
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 409),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    const tmaCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/tma';
    });
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? '{}';
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({ intent: 'link', returnUrl: `${window.location.origin}/settings` });
  });

  it('renders TMA deep navigation not-found state', async () => {
    resetPath('/tma?startapp=missing_destination');
    tma.useRawInitData.mockReturnValue(undefined);

    render(<App />);

    expect(await screen.findByText('The requested Mini App destination was not found.')).toBeTruthy();
  });

  it('finishes Discord callback through the SPA route', async () => {
    resetPath('/auth/discord/callback?code=discord-code&state=oauth-state');
    const pending = deferredResponse();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(jsonResponse({ data: { user: { locale: 'en' } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { profile: { email: 'discord@example.com' } } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Waiting for Discord confirmation.')).toBeTruthy();
    pending.resolve(
      jsonResponse({
        data: {
          session: {
            user: {
              email: 'discord@example.com',
              id: 'user-id',
              permissions: [],
              roles: [],
              tenantId: 'tenant-id',
              theme: 'system',
            },
          },
          status: 'authenticated',
        },
      }),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
    });
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.includes('/auth/discord/callback') &&
          url.includes('code=discord-code') &&
          url.includes('state=oauth-state')
        );
      }),
    ).toBe(true);
  });

  it('renders provider-specific Discord callback errors', async () => {
    resetPath('/auth/discord/callback');

    render(<App />);

    expect(await screen.findByText('Discord did not return the required sign-in state. Start again.')).toBeTruthy();
  });

  it('projects a completed Better Auth Telegram OIDC session through the SPA callback', async () => {
    resetPath('/auth/telegram/callback');
    sessionStorage.setItem('telegramOidcAuthState', JSON.stringify({ intent: 'login', returnUrl: '/profile' }));
    const fetchMock = setFetch(
      jsonResponse({
        data: {
          session: {
            user: {
              email: null,
              id: 'user-id',
              permissions: [],
              roles: [],
              tenantId: 'tenant-id',
              theme: 'system',
            },
          },
          status: 'authenticated',
        },
      }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { profile: { email: null } } }),
    );

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
    });
    const projectionCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/oidc/session';
    });
    expect(projectionCalls).toHaveLength(1);
    const projectionCall = projectionCalls[0];
    const request = projectionCall?.[0] as Request;
    expect(request.credentials).toBe('include');
    expect(JSON.parse(await request.clone().text())).toEqual({
      intent: 'login',
      returnUrl: `${window.location.origin}/profile`,
    });
    expect(sessionStorage.getItem('telegramOidcAuthState')).toBeNull();
  });

  it('does not project a Telegram OIDC callback that contains a provider error', async () => {
    resetPath('/auth/telegram/callback?error=access_denied');
    sessionStorage.setItem('telegramOidcAuthState', JSON.stringify({ intent: 'login', returnUrl: '/profile' }));
    const fetchMock = setFetch();

    render(<App />);

    expect(await screen.findByText('Telegram did not complete sign-in. Start again.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('telegramOidcAuthState')).toBeNull();
  });

  it('social auth buttons call wrapper-backed redirect logic', async () => {
    resetPath('/auth');

    const fetchMock = setFetch(
      jsonResponse({
        data: {},
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Discord' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/auth/discord/authorization-request'),
        ),
      ).toBe(true);
    });
  });

  it('prevents double Discord authorization requests while loading', async () => {
    resetPath('/auth');
    const pending = deferredResponse();
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      return pathname === '/auth/me' ? Promise.resolve(jsonResponse({}, false, 401)) : pending.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    const discordButton = await screen.findByRole('button', {
      name: 'Continue with Discord',
    });
    fireEvent.click(discordButton);
    fireEvent.click(discordButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/auth/discord/authorization-request'),
        ),
      ).toHaveLength(1);
    });
    const loadingDiscordButton = await screen.findByRole('button', {
      name: /Waiting for Discord confirmation\./u,
    });
    expect((loadingDiscordButton as HTMLButtonElement).disabled).toBe(true);
    pending.resolve(jsonResponse({ data: {} }));
  });

  it('starts Telegram OIDC from the social entry instead of routing to TMA', async () => {
    resetPath('/auth');
    tma.useRawInitData.mockReturnValue(undefined);
    const fetchMock = setFetch(jsonResponse({ redirect: false, url: '' }));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Telegram' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
        ),
      ).toBe(true);
    });
    const request = fetchMock.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
    )?.[0] as Request;
    expect(new URL(request.url).pathname).toBe('/api/auth/sign-in/oauth2');
    expect(JSON.parse(await request.clone().text())).toMatchObject({
      callbackURL: 'https://app.local.test/auth/telegram/callback',
      disableRedirect: true,
      providerId: 'telegram',
    });
    expect(window.location.pathname).toBe('/auth');
  });

  it('production social auth code never reads unsafe Telegram init data', () => {
    // The TMA feature source guard moved with the code into
    // @app/frontend-feature-user-tma-auth (see its use-tma-auth.spec).
    const socialApiSource = readFileSync(resolve(sourceRoot, 'features/social-auth/api/social-auth-api.ts'), 'utf8');

    expect(socialApiSource).not.toContain('init' + 'DataUnsafe');
  });

  it('navigates route links without a full page reload', async () => {
    render(<App />);

    fireEvent.click((await screen.findAllByRole('link', { name: 'Settings' }))[0]!);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings');
    });
  });
});
