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

const { useUserPreferenceControls } = await import('./use-user-preference-controls');

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('useUserPreferenceControls', () => {
  beforeEach(() => {
    authControllerUpdatePreferences.mockClear();
  });

  it('applies locale and theme locally without a network call', () => {
    const { result } = renderHook(() => useUserPreferenceControls(), { wrapper: createWrapper() });

    act(() => {
      result.current.applyUserLocale('ru');
      result.current.applyUserTheme('dark');
    });

    expect(result.current.userLocale).toBe('ru');
    expect(result.current.userTheme).toBe('dark');
  });

  it('persists locale and theme through the preferences mutation', async () => {
    authControllerUpdatePreferences.mockResolvedValue({
      data: { data: { user: { locale: 'ru', theme: 'dark' } } },
      response: new Response(null),
    });
    const { result } = renderHook(() => useUserPreferenceControls(), { wrapper: createWrapper() });

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
    const { result } = renderHook(() => useUserPreferenceControls(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.persistUserLocale('en');
      await result.current.persistUserTheme('light');
    });

    await waitFor(() => {
      expect(authControllerUpdatePreferences).toHaveBeenCalledTimes(2);
    });
  });
});
