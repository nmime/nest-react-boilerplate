import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authControllerLogout = vi.fn();
const clearSession = vi.fn();

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useAuthApiClient: () => ({ api: { authControllerLogout }, requestOptions: {} }),
  };
});

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();
  return { ...actual, useAuthShellStore: () => ({ clearSession }) };
});

const { useLogout } = await import('./use-logout');

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

describe('useLogout', () => {
  beforeEach(() => {
    authControllerLogout.mockReset().mockResolvedValue({ data: { data: {} }, response: new Response(null) });
    clearSession.mockReset();
  });

  it('signs out and navigates to the default auth route', async () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useLogout({ navigate }), { wrapper: createWrapper() });

    result.current.signOut();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/auth', { replace: true });
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(authControllerLogout).toHaveBeenCalledWith({});
  });

  it('honours a custom redirect target', async () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useLogout({ navigate, redirectTo: '/goodbye' }), { wrapper: createWrapper() });

    result.current.signOut();

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/goodbye', { replace: true });
    });
  });

  it('signs out without a navigate handler', async () => {
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.signOut();

    await waitFor(() => {
      expect(clearSession).toHaveBeenCalledTimes(1);
    });
  });

  it('destroys the model on unmount', () => {
    const { unmount } = renderHook(() => useLogout(), { wrapper: createWrapper() });
    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
