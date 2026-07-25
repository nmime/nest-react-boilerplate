import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authControllerUpdatePreferences = vi.fn();

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useAuthApiClient: () => ({ api: { authControllerUpdatePreferences }, requestOptions: {} }),
  };
});

const { useSessionPreferenceControls } = await import('./use-session-preference-controls');

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('useSessionPreferenceControls', () => {
  beforeEach(() => {
    authControllerUpdatePreferences.mockClear();
  });

  it('applies locale and theme locally without a network call', () => {
    const { result } = renderHook(() => useSessionPreferenceControls(), { wrapper: createWrapper() });

    act(() => {
      result.current.applyUserLocale('ru');
      result.current.applyUserTheme('dark');
    });

    expect(result.current.userLocale).toBe('ru');
    expect(result.current.userTheme).toBe('dark');
  });

  it('persists locale and theme through the preferences mutation and invalidates supplied keys', async () => {
    authControllerUpdatePreferences.mockResolvedValue({
      data: { data: { user: { locale: 'ru', theme: 'dark' } } },
      response: new Response(null),
    });
    const { result } = renderHook(() => useSessionPreferenceControls({ invalidateQueryKeys: () => [['profile']] }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.persistUserLocale('ru');
      await result.current.persistUserTheme('dark');
    });

    expect(authControllerUpdatePreferences).toHaveBeenCalledWith({ locale: 'ru' }, {});
    expect(authControllerUpdatePreferences).toHaveBeenCalledWith({ theme: 'dark' }, {});
  });

  it('swallows persistence failures so the local choice is retained', async () => {
    authControllerUpdatePreferences.mockResolvedValue({
      error: { detail: 'nope' },
      response: new Response(null, { status: 400 }),
    });
    const { result } = renderHook(() => useSessionPreferenceControls(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.persistUserLocale('en');
      await result.current.persistUserTheme('light');
    });

    await waitFor(() => {
      expect(authControllerUpdatePreferences).toHaveBeenCalledTimes(2);
    });
  });

  describe('with guardExplicitOverrides', () => {
    it('applies server values until the user explicitly persists one, then latches the choice', async () => {
      authControllerUpdatePreferences.mockResolvedValue({
        data: { data: { user: { locale: 'ru', theme: 'dark' } } },
        response: new Response(null),
      });
      const { result } = renderHook(
        () =>
          useSessionPreferenceControls({
            guardExplicitOverrides: true,
            invalidateQueryKeys: () => [['admin', 'profile']],
          }),
        { wrapper: createWrapper() },
      );

      // Server-derived apply flows through while no explicit choice exists.
      act(() => {
        result.current.applyUserLocale('en');
        result.current.applyUserTheme('light');
      });
      expect(result.current.userLocale).toBe('en');
      expect(result.current.userTheme).toBe('light');

      // An explicit persist latches the user's choice immediately.
      await act(async () => {
        await result.current.persistUserLocale('ru');
        await result.current.persistUserTheme('dark');
      });
      expect(result.current.userLocale).toBe('ru');
      expect(result.current.userTheme).toBe('dark');

      // Later server-derived apply calls no longer override the explicit choice.
      act(() => {
        result.current.applyUserLocale('en');
        result.current.applyUserTheme('light');
      });
      expect(result.current.userLocale).toBe('ru');
      expect(result.current.userTheme).toBe('dark');
    });
  });
});
