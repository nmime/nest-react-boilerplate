import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { authApi, userApi } from '@app/frontend-api-client';
import { LogoutModel } from './logout-model';

const setup = (logout: () => Promise<unknown>) => {
  const order: string[] = [];
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const clearSession = vi.fn(() => {
    order.push('clearSession');
  });
  const invalidateSpy = vi
    .spyOn(queryClient, 'invalidateQueries')
    .mockImplementation((filters?: { queryKey?: unknown }) => {
      order.push(`invalidate:${JSON.stringify(filters?.queryKey)}`);
      return Promise.resolve();
    });
  const onSignedOut = vi.fn(() => {
    order.push('onSignedOut');
  });
  const logoutRequest = vi.fn(async () => {
    order.push('logout');
    return logout();
  });
  const model = new LogoutModel({
    authStore: { clearSession },
    logout: logoutRequest,
    queryClient,
  });

  return {
    clearSession,
    invalidateSpy,
    logoutRequest,
    model,
    onSignedOut,
    order,
  };
};

describe('LogoutModel', () => {
  it('revokes the session, clears the store, invalidates caches, then navigates', async () => {
    const { clearSession, invalidateSpy, logoutRequest, model, onSignedOut, order } = setup(() =>
      Promise.resolve({ ok: true }),
    );

    await model.signOut({ onSignedOut });

    expect(logoutRequest).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: authApi.getAuthControllerMeQueryKey(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: userApi.getProfileControllerMeQueryKey(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: authApi.getAuthControllerProviderIdentitiesQueryKey(),
    });
    expect(onSignedOut).toHaveBeenCalledTimes(1);

    // Ordering: request (with token) -> clear session -> invalidate -> navigate.
    expect(order[0]).toBe('logout');
    expect(order.indexOf('logout')).toBeLessThan(order.indexOf('clearSession'));
    expect(order.indexOf('clearSession')).toBeLessThan(order.indexOf('onSignedOut'));
    expect(order.indexOf('clearSession')).toBeLessThan(order.findIndex((entry) => entry.startsWith('invalidate:')));

    model.destroy();
  });

  it('clears the session and navigates even when the logout request fails', async () => {
    const { clearSession, invalidateSpy, model, onSignedOut, order } = setup(() =>
      Promise.reject(new Error('network down')),
    );

    await expect(model.signOut({ onSignedOut })).resolves.toBeUndefined();

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(order.indexOf('logout')).toBeLessThan(order.indexOf('clearSession'));

    model.destroy();
  });
});
