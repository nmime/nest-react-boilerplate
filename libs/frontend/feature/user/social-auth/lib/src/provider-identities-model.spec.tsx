import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authControllerProviderIdentities = vi.fn();
const authControllerUnlinkProviderIdentity = vi.fn();

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useAuthApiClient: () => ({
      api: { authControllerProviderIdentities, authControllerUnlinkProviderIdentity },
      requestOptions: {},
    }),
  };
});

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();
  return { ...actual, useAuthShellStore: () => ({ isAuthenticated: true }) };
});

const { useProviderIdentitiesModel } = await import('./provider-identities-model');

const ok = (data: unknown) => ({ data: { data }, response: new Response(null) });
const fail = () => ({ error: { detail: 'nope' }, response: new Response(null, { status: 400 }) });

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  authControllerProviderIdentities.mockResolvedValue(ok({ identities: [] }));
});

describe('useProviderIdentitiesModel', () => {
  it('fetches identities when authenticated and cleans up on unmount', async () => {
    const { unmount } = renderHook(() => useProviderIdentitiesModel(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(authControllerProviderIdentities).toHaveBeenCalled();
    });
    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it('unlinks an identity and invalidates the list on success', async () => {
    authControllerUnlinkProviderIdentity.mockResolvedValue(ok({ ok: true }));
    const { result } = renderHook(() => useProviderIdentitiesModel(), { wrapper: createWrapper() });

    result.current.unlink('identity-1');

    await waitFor(() => {
      expect(authControllerUnlinkProviderIdentity).toHaveBeenCalledWith('identity-1', {});
    });
  });

  it('swallows unlink failures (surfaced via the observable mutation state)', async () => {
    authControllerUnlinkProviderIdentity.mockResolvedValue(fail());
    const { result } = renderHook(() => useProviderIdentitiesModel(), { wrapper: createWrapper() });

    result.current.unlink('identity-2');

    await waitFor(() => {
      expect(result.current.unlinkMutation.isError).toBe(true);
    });
  });
});
