import type { ReactNode, SubmitEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authApiMock = {
  authControllerMe: vi.fn(),
  authControllerLogin: vi.fn(),
  authControllerRegister: vi.fn(),
};
const profileControllerMe = vi.fn();
const markAuthenticated = vi.fn();
const clearSession = vi.fn();

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useAuthApiClient: () => ({ api: authApiMock, requestOptions: {} }),
    useUserApiClient: () => ({ api: { profileControllerMe }, requestOptions: {} }),
  };
});

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();
  return { ...actual, useAuthShellStore: () => ({ markAuthenticated, clearSession }) };
});

const { useAuthSessionFlow } = await import('./use-auth-session-flow');
const { AuthMode } = await import('./auth-model');

const ok = (data: unknown) => ({ data: { data }, response: new Response(null) });
const fail = () => ({ error: { detail: 'nope' }, response: new Response(null, { status: 401 }) });

const messages = {
  authenticationFailed: 'auth failed',
  unauthenticated: 'not signed in',
  profileRequestFailed: 'profile failed',
  profileUnknown: 'unknown',
};

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const render = (over: Partial<Parameters<typeof useAuthSessionFlow>[0]> = {}) => {
  const applyUserLocale = vi.fn();
  const applyUserTheme = vi.fn();
  const navigate = vi.fn();
  const hook = renderHook(
    () =>
      useAuthSessionFlow({
        applyUserLocale,
        applyUserTheme,
        locale: 'en',
        messages,
        navigate,
        returnUrl: null,
        ...over,
      }),
    { wrapper: createWrapper() },
  );
  return { applyUserLocale, applyUserTheme, navigate, ...hook };
};

const submitEvent = (values: Record<string, string>): SubmitEvent<HTMLFormElement> => {
  const form = document.createElement('form');
  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    form.append(input);
  }
  return { preventDefault: vi.fn(), currentTarget: form } as unknown as SubmitEvent<HTMLFormElement>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAuthSessionFlow', () => {
  it('marks the session authenticated and applies server locale/theme when ready', async () => {
    authApiMock.authControllerMe.mockResolvedValue(
      ok({ principal: { subject: 's1', email: 'a@example.com' }, user: { locale: 'en', theme: 'dark' } }),
    );
    profileControllerMe.mockResolvedValue(ok({ profile: { email: 'a@example.com', locale: 'en' } }));

    const { result, applyUserLocale, applyUserTheme } = render();

    await waitFor(() => {
      expect(result.current.profileState.status).toBe('ready');
    });
    expect(markAuthenticated).toHaveBeenCalled();
    expect(applyUserLocale).toHaveBeenCalledWith('en');
    expect(applyUserTheme).toHaveBeenCalledWith('dark');
  });

  it('reports unauthenticated and clears the session when there is no session', async () => {
    authApiMock.authControllerMe.mockResolvedValue(fail());

    const { result } = render();

    await waitFor(() => {
      expect(result.current.profileState.status).toBe('unauthenticated');
    });
    expect(clearSession).toHaveBeenCalled();
    expect(profileControllerMe).not.toHaveBeenCalled();
  });

  it('applies a diverging server locale and skips the profile query until locales match', async () => {
    authApiMock.authControllerMe.mockResolvedValue(ok({ user: { locale: 'ru' } }));

    const { applyUserLocale } = render({ locale: 'en' });

    await waitFor(() => {
      expect(applyUserLocale).toHaveBeenCalledWith('ru');
    });
    expect(profileControllerMe).not.toHaveBeenCalled();
  });

  it('logs in, applies returned preferences, and navigates to a safe return url', async () => {
    authApiMock.authControllerMe.mockResolvedValue(fail());
    let resolveLogin!: (value: unknown) => void;
    authApiMock.authControllerLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    const { result, applyUserLocale, applyUserTheme, navigate } = render({ returnUrl: '/profile' });

    await waitFor(() => {
      expect(result.current.profileState.status).toBe('unauthenticated');
    });

    act(() => {
      result.current.submitAuth(AuthMode.Login, submitEvent({ email: 'a@example.com', password: 'secret' }));
    });
    await waitFor(() => {
      expect(result.current.isLoginPending).toBe(true);
    });
    expect(result.current.isRegisterPending).toBe(false);

    act(() => {
      resolveLogin(ok({ user: { locale: 'ru', theme: 'dark' } }));
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/profile', { replace: true });
    });
    expect(authApiMock.authControllerLogin).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret' }, {});
    expect(applyUserLocale).toHaveBeenCalledWith('ru');
    expect(applyUserTheme).toHaveBeenCalledWith('dark');
  });

  it('does not navigate for an unsafe return url and tolerates an empty success body', async () => {
    authApiMock.authControllerMe.mockResolvedValue(fail());
    authApiMock.authControllerLogin.mockResolvedValue(ok({}));

    const { result, navigate } = render({ returnUrl: '//evil.example.com' });

    await waitFor(() => {
      expect(result.current.profileState.status).toBe('unauthenticated');
    });
    act(() => {
      result.current.submitAuth(AuthMode.Login, submitEvent({ email: 'a@example.com', password: 'secret' }));
    });

    await waitFor(() => {
      expect(result.current.isLoginPending).toBe(false);
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('surfaces a forbidden state and register-pending flag when registration fails', async () => {
    authApiMock.authControllerMe.mockResolvedValue(fail());
    let resolveRegister!: (value: unknown) => void;
    authApiMock.authControllerRegister.mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );

    const { result } = render();

    await waitFor(() => {
      expect(result.current.profileState.status).toBe('unauthenticated');
    });
    act(() => {
      result.current.submitAuth(
        AuthMode.Register,
        submitEvent({ displayName: 'Ada', email: 'a@example.com', password: 'secret' }),
      );
    });
    await waitFor(() => {
      expect(result.current.isRegisterPending).toBe(true);
    });
    expect(result.current.isLoginPending).toBe(false);

    act(() => {
      resolveRegister(fail());
    });

    await waitFor(() => {
      expect(result.current.profileState.status).toBe('forbidden');
    });
  });
});
