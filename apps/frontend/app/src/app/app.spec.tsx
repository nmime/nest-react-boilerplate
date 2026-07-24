import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './app';

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
    statusText: ok ? 'OK' : 'Error',
  });

const installStorage = () => {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => {
        values.clear();
      },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
};

function installRadixPointerMocks() {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
}

function chooseSelectOption(label: string | RegExp, option: string) {
  const trigger = screen.getByRole('combobox', { name: label });

  installRadixPointerMocks();
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });

  const optionElement = document.querySelector<HTMLElement>(`[role="option"][data-value="${option}"]`);

  expect(optionElement).toBeTruthy();
  fireEvent.click(optionElement as HTMLElement);
}

type FetchReply = Response | { rejectsWith: Error };

const setFetch = (...responses: FetchReply[]) => {
  let initialSessionChecked = false;
  const queue = [...responses];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (pathname === '/auth/me' && !initialSessionChecked) {
      initialSessionChecked = true;
      return Promise.resolve(jsonResponse({}, false, 401));
    }
    const response = queue.shift();
    if (!response) {
      return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
    }
    return 'rejectsWith' in response ? Promise.reject(response.rejectsWith) : Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

type FetchInit = {
  body?: BodyInit | null;
  headers?: Record<string, string>;
  method?: string;
};

type FetchMock = ReturnType<typeof setFetch>;
type FetchCall = [unknown, unknown?];

const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> | undefined =>
  headers ? Object.fromEntries(new Headers(headers).entries()) : undefined;

const getCalledUrl = (calledInput: unknown): string =>
  calledInput instanceof Request ? calledInput.url : String(calledInput);

const getCalledInit = (calledInput: unknown, init: unknown): FetchInit => {
  if (calledInput instanceof Request) {
    return {
      body: calledInput.body,
      headers: normalizeHeaders(calledInput.headers),
      method: calledInput.method,
    };
  }

  const requestInit = init as RequestInit | undefined;

  return {
    body: requestInit?.body,
    headers: normalizeHeaders(requestInit?.headers),
    method: requestInit?.method,
  };
};

const matchesUrl = (actualUrl: string, expectedUrl: string): boolean => {
  if (actualUrl === expectedUrl) {
    return true;
  }

  if (expectedUrl.startsWith('/')) {
    try {
      return new URL(actualUrl).pathname === expectedUrl;
    } catch {
      return false;
    }
  }

  return false;
};

const findFetchCall = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchCall | undefined =>
  fetchMock.mock.calls.find(([calledInput, init]) => {
    const fetchInit = getCalledInit(calledInput, init);

    return (
      matchesUrl(getCalledUrl(calledInput), url) &&
      (!method || fetchInit.method === method) &&
      Object.entries(expectedHeaders).every(([key, value]) => fetchInit.headers?.[key.toLowerCase()] === value)
    );
  }) as FetchCall | undefined;

const findFetchInit = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit | undefined => {
  const call = findFetchCall(fetchMock, url, expectedHeaders, method);

  return call ? getCalledInit(call[0], call[1]) : undefined;
};

const readFetchBody = async (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): Promise<string | undefined> => {
  const call = findFetchCall(fetchMock, url, expectedHeaders, method);
  if (!call) {
    return undefined;
  }

  if (call[0] instanceof Request) {
    return call[0].clone().text();
  }

  const body = getCalledInit(call[0], call[1]).body;
  return typeof body === 'string' ? body : undefined;
};

const expectFetchRequest = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit => {
  const init = findFetchInit(fetchMock, url, expectedHeaders, method);
  expect(init, `missing ${method ?? 'GET'} ${url}`).toBeTruthy();
  expect(init?.headers).toMatchObject(
    Object.fromEntries(
      Object.entries({
        Accept: 'application/json',
        ...expectedHeaders,
      }).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  );

  return init as FetchInit;
};

// Waits for the async router to render the persistent shell (its nav is present
// on every route) so the outlet content is available to query.
const awaitShell = () => screen.findAllByRole('link', { name: 'Home' });

const submitLogin = async (email = 'user@example.com') => {
  await awaitShell();
  if (!screen.queryByLabelText('Login email')) {
    fireEvent.click(screen.getAllByRole('link', { name: 'Open' })[0]!);
  }
  fireEvent.change(await screen.findByLabelText('Login email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Login password'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
};

describe('User app shell', () => {
  beforeEach(() => {
    installStorage();
    window.localStorage.clear();
    document.cookie = 'locale=; path=/; max-age=0';
    document.cookie = 'lang=; path=/; max-age=0';
    window.history.pushState({}, '', '/');
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders a neutral account home through the shared shell', async () => {
    const { container } = render(<App />);
    await screen.findByText('Account essentials');
    const html = container.innerHTML;

    expect(html).toContain('Nest React Boilerplate');
    expect(html).toContain('A clear place to manage your account.');
    expect(html).toContain('Account essentials');
    expect(html).toContain('Choose how to sign in');
    expect(html).not.toContain('design v3');
    expect(html).not.toContain('route readiness');
    expect(html).not.toContain('3003');
  });

  it('returns through browser history for routes opened by the app', async () => {
    render(<App />);
    await awaitShell();
    fireEvent.click(screen.getAllByRole('link', { name: 'Settings' })[0]!);
    await screen.findByText('Preferences');

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it('falls back to home when there is no in-app history to pop', async () => {
    window.history.pushState({}, '', '/settings');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(<App />);
    await awaitShell();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('Account essentials')).toBeTruthy();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('renders every preserved user route without scaffold diagnostics', async () => {
    const routes = [
      '/',
      '/auth',
      '/auth/discord/callback',
      '/profile',
      '/settings',
      '/tma',
      '/tma/auth',
      '/telegram-mini-app',
      '/link/telegram',
      '/link/discord',
    ];

    for (const route of routes) {
      window.history.pushState({}, '', route);
      const { container, unmount } = render(<App />);
      // eslint-disable-next-line no-await-in-loop -- routes render sequentially; each is unmounted before the next.
      await awaitShell();
      const html = container.innerHTML;

      expect(html).toContain('<main');
      expect(html).toContain('xr-mini-app-bottom-bar');
      expect(html).not.toContain('data-design-marker');
      expect(html).not.toContain('route readiness');
      expect(html).not.toContain('nonblank smoke');
      unmount();
    }
  });

  it('renders the home shell even when local storage access throws', async () => {
    installStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage blocked');
      },
    });

    const { container } = render(<App />);
    await screen.findByText('Account essentials');
    expect(container.innerHTML).toContain('Nest React Boilerplate');
  });

  it('loads a profile after login establishes a cookie session', async () => {
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api/');
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({
        data: {
          principal: { subject: 'subject-id', email: 'ready@example.com' },
        },
      }),
    );

    render(<App />);
    await submitLogin('ready@example.com');

    expect(await screen.findByText('Ready: ready@example.com')).toBeTruthy();
    expectFetchRequest(fetchMock, '/auth/me', {
      'Accept-Language': 'en',
    });
    expectFetchRequest(fetchMock, 'https://user-api/profile/me', {
      'Accept-Language': 'en',
    });
  });

  it('returns to the protected route after auth redirect login', async () => {
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({
        data: {
          principal: { subject: 'return-subject', email: 'return@example.com' },
        },
      }),
    );

    render(<App />);
    await submitLogin('return@example.com');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
    });
    expect(await screen.findByText('Ready: return@example.com')).toBeTruthy();
  });

  it('shows forbidden states for profile response and thrown failures', async () => {
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), jsonResponse({}, false, 403));
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Request failed with 403.')).toBeTruthy();
    unmount();

    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), {
      rejectsWith: 'network failed',
    });
    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Profile request failed.')).toBeTruthy();
  });

  it('handles incomplete profile payloads and non-error auth rejections', async () => {
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), jsonResponse({ data: {} }));
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: unknown')).toBeTruthy();
    unmount();
    cleanup();
    window.localStorage.clear();
    document.cookie = 'locale=; path=/; max-age=0';
    document.cookie = 'lang=; path=/; max-age=0';
    window.history.pushState({}, '', '/');

    const rejectAuthJson = vi.fn<() => Promise<unknown>>().mockRejectedValue('auth offline');
    const rejectAuthResponse = new Response(null, {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
    vi.spyOn(rejectAuthResponse, 'json').mockImplementation(rejectAuthJson);
    setFetch(rejectAuthResponse);
    render(<App />);
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText('Sign in or register to continue.')).toBeTruthy();
    });
  });

  it('uses saved user locale before profile calls and ignores stale local storage', async () => {
    window.localStorage.setItem('boilerplate.locale', 'en');
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api/');
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'ru' } } }),
      jsonResponse({ data: { user: { locale: 'ru' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );

    render(<App />);
    await submitLogin();

    expect(await screen.findByText('Готово: profile-subject')).toBeTruthy();
    expectFetchRequest(fetchMock, '/auth/me', {
      'Accept-Language': 'en',
    });
    expectFetchRequest(fetchMock, '/auth/me', {
      'Accept-Language': 'ru',
    });
    expectFetchRequest(fetchMock, 'https://user-api/profile/me', {
      'Accept-Language': 'ru',
    });
  });

  it('persists language switches for authenticated users and subsequent calls', async () => {
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
      jsonResponse({ data: { user: { locale: 'ru' } } }),
      jsonResponse({ data: { user: { locale: 'ru' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );

    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();

    chooseSelectOption('Language', 'ru');

    await waitFor(() => {
      expect(
        findFetchInit(
          fetchMock,
          '/auth/me/preferences',
          {
            'Accept-Language': 'ru',
            'Content-Type': 'application/json',
          },
          'PATCH',
        ),
      ).toBeTruthy();
    });
    expectFetchRequest(
      fetchMock,
      '/auth/me/preferences',
      {
        'Accept-Language': 'ru',
        'Content-Type': 'application/json',
      },
      'PATCH',
    );
    await expect(
      readFetchBody(
        fetchMock,
        '/auth/me/preferences',
        {
          'Accept-Language': 'ru',
          'Content-Type': 'application/json',
        },
        'PATCH',
      ),
    ).resolves.toBe(JSON.stringify({ locale: 'ru' }));
    await waitFor(() => {
      expect(
        findFetchInit(fetchMock, '/profile/me', {
          'Accept-Language': 'ru',
        }),
      ).toBeTruthy();
    });
  });

  it('persists theme switches for authenticated users', async () => {
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en', theme: 'system' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
      jsonResponse({ data: { theme: 'dark' } }),
      jsonResponse({ data: { user: { locale: 'en', theme: 'dark' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );

    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();

    chooseSelectOption('Theme', 'dark');

    await waitFor(() => {
      expect(
        findFetchInit(
          fetchMock,
          '/auth/me/preferences',
          {
            'Accept-Language': 'en',
            'Content-Type': 'application/json',
          },
          'PATCH',
        ),
      ).toBeTruthy();
    });
    await expect(
      readFetchBody(
        fetchMock,
        '/auth/me/preferences',
        {
          'Accept-Language': 'en',
          'Content-Type': 'application/json',
        },
        'PATCH',
      ),
    ).resolves.toBe(JSON.stringify({ theme: 'dark' }));
  });

  it('logs in then loads the protected profile', async () => {
    vi.stubEnv('VITE_AUTH_API_BASE_URL', 'https://auth-api/');
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );
    window.history.pushState({}, '', '/auth');
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Login email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Login password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();
  });

  it('handles register failures and empty success tokens', async () => {
    setFetch(jsonResponse({}, false, 409));
    window.history.pushState({}, '', '/auth');
    const { unmount } = render(<App />);

    fireEvent.change(await screen.findByLabelText('Register display name'), {
      target: { value: 'Registered User' },
    });
    fireEvent.change(screen.getByLabelText(/^(Register email|Email de registro)$/u), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^(Register password|Contraseña de registro)$/u), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Register|Registrarse)$/u }));
    expect(await screen.findByText('Forbidden: Request failed with 409.')).toBeTruthy();
    unmount();

    setFetch(jsonResponse({ data: {} }));
    window.history.pushState({}, '', '/auth');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Login' }));
    await waitFor(() => {
      expect(screen.getByText('Sign in or register to continue.')).toBeTruthy();
    });
  });

  it('continues after a verified session and hides unnormalized object error details', async () => {
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { profile: { email: 'after-auth@example.com' } } }),
    );
    window.history.pushState({}, '', '/auth');
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: after-auth@example.com')).toBeTruthy();
    unmount();

    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), {
      rejectsWith: { detail: 'Object detail' },
    });
    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Profile request failed.')).toBeTruthy();
  });

  it('applies profile locales and auth success locale/theme payloads', async () => {
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en', theme: 'light' } } }),
      jsonResponse({
        data: {
          profile: { email: 'locale@example.com', locale: 'ru', theme: 'blue' },
        },
      }),
      jsonResponse({ data: { user: { locale: 'ru', theme: 'light' } } }),
      jsonResponse({
        data: {
          profile: { email: 'locale@example.com', locale: 'ru', theme: 'blue' },
        },
      }),
    );
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Готово: locale@example.com')).toBeTruthy();
    unmount();

    setFetch(
      jsonResponse({
        data: { user: { locale: 'ru', theme: 'dark' } },
      }),
      jsonResponse({ data: { user: { locale: 'ru', theme: 'dark' } } }),
      jsonResponse({ data: { profile: { email: 'registered@example.com' } } }),
    );
    window.history.pushState({}, '', '/auth');
    render(<App />);
    (await screen.findByLabelText(/^(Register display name|Отображаемое имя для регистрации)$/u)).remove();
    fireEvent.change(screen.getByLabelText(/^(Register email|Email для регистрации)$/u), {
      target: { value: 'registered@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^(Register password|Пароль для регистрации)$/u), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Register|Зарегистрироваться)$/u }));

    expect(await screen.findByText('Готово: registered@example.com')).toBeTruthy();
  });

  it('renders link-discord and unknown routes through the shell', async () => {
    window.history.pushState({}, '', '/link/discord');
    const { unmount } = render(<App />);

    expect(await screen.findByText('Preferences')).toBeTruthy();
    unmount();

    window.history.pushState({}, '', '/settings/');
    const trailingSlash = render(<App />);
    expect(await screen.findByText('Preferences')).toBeTruthy();
    trailingSlash.unmount();

    window.history.pushState({}, '', '/unknown');
    render(<App />);

    expect(await screen.findByText('Account essentials')).toBeTruthy();
    expect(window.location.pathname).toBe('/unknown');
  });

  it('lets the browser handle non-SPA link clicks', () => {
    render(<App />);
    const startPath = window.location.pathname;
    const preventBrowserNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    const appendAnchor = (href: string, configure?: (anchor: HTMLAnchorElement) => void) => {
      const anchor = document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = href;
      configure?.(anchor);
      document.body.append(anchor);
      return anchor;
    };

    document.addEventListener('click', preventBrowserNavigation);
    try {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      fireEvent.click(appendAnchor('/settings'), { metaKey: true });
      fireEvent.click(
        appendAnchor('/profile', (anchor) => {
          anchor.target = '_blank';
        }),
      );
      fireEvent.click(
        appendAnchor('/download', (anchor) => {
          anchor.setAttribute('download', 'report.txt');
        }),
      );
      fireEvent.click(appendAnchor('mailto:support@example.test'));
    } finally {
      document.removeEventListener('click', preventBrowserNavigation);
    }

    expect(window.location.pathname).toBe(startPath);
  });
});
