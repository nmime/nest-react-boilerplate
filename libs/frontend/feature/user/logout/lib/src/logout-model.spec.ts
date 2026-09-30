// @requirements REQ-AUTH-FRONTEND-009
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
  const onSignedOut = vi.fn(() => {
    order.push('onSignedOut');
  });
  const logoutRequest = vi.fn(async () => {
    order.push('logout');
    return logout();
  });
  const model = new LogoutModel({ authStore: { clearSession }, logout: logoutRequest, queryClient });
  return { clearSession, logoutRequest, model, onSignedOut, order, queryClient };
};

describe('LogoutModel', () => {
  it('revokes the session and removes warm private data before navigating', async () => {
    const { clearSession, logoutRequest, model, onSignedOut, order, queryClient } = setup(() =>
      Promise.resolve({ ok: true }),
    );
    const keys = [
      authApi.getAuthControllerMeQueryKey(),
      userApi.getProfileControllerMeQueryKey(),
      authApi.getAuthControllerProviderIdentitiesQueryKey(),
      ['private-billing'],
    ];
    for (const key of keys) {
      queryClient.setQueryData(key, { email: 'preceding-account@example.test' });
    }
    await model.signOut({ onSignedOut });
    expect(logoutRequest).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(order).toEqual(['logout', 'clearSession', 'onSignedOut']);
    model.destroy();
  });

  it('cancels a pending private read so its late completion cannot refill the cache', async () => {
    const { model, queryClient } = setup(() => Promise.resolve({ ok: true }));
    let resolveRead!: (data: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      resolveRead = resolve;
    });
    const queryKey = authApi.getAuthControllerProviderIdentitiesQueryKey();
    const result = queryClient.query<unknown>({ queryKey, queryFn: () => pending }).catch(() => undefined);
    await model.signOut();
    resolveRead({ items: [{ email: 'private@example.test' }] });
    await result;
    await Promise.resolve();
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    model.destroy();
  });

  it('exposes the mutation pending flag', () => {
    const { model } = setup(() => Promise.resolve({ ok: true }));
    expect(model.isPending).toBe(false);
    model.destroy();
  });

  it('sends the current request after rebinding the API client', async () => {
    const { logoutRequest, model, order } = setup(() => Promise.resolve({ ok: true }));
    const rebound = vi.fn(async () => {
      order.push('rebound-logout');
      return { ok: true };
    });
    model.setLogout(rebound);
    await model.signOut();
    expect(rebound).toHaveBeenCalledOnce();
    expect(logoutRequest).not.toHaveBeenCalled();
    expect(order[0]).toBe('rebound-logout');
    model.destroy();
  });

  it('purges private data on failure and retains a retryable error without claiming success', async () => {
    const { clearSession, model, onSignedOut, queryClient } = setup(() => Promise.reject(new Error('network down')));
    queryClient.setQueryData(['private-profile'], { email: 'private@example.test' });
    await expect(model.signOut({ onSignedOut })).rejects.toThrow('network down');
    expect(clearSession).toHaveBeenCalledOnce();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(model.mutation.isError).toBe(true);
    model.setLogout(() => Promise.resolve({ ok: true }));
    await model.signOut({ onSignedOut });
    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(model.mutation.isError).toBe(false);
    model.destroy();
  });
});
