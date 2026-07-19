import { describe, expect, it, vi } from 'vitest';

import { createApiRuntimeEventHub, type NormalizedApiErrorSnapshot } from './runtime-events';

const snapshot = (overrides: Partial<NormalizedApiErrorSnapshot> = {}): NormalizedApiErrorSnapshot => ({
  code: 'http.500',
  endpoint: '/profile',
  id: 'GET:/profile:500:http.500',
  kind: 'server',
  message: 'Server exploded',
  method: 'GET',
  status: 500,
  ...overrides,
});

describe('createApiRuntimeEventHub', () => {
  it('transitions to offline and server-error states and records the last error', () => {
    const hub = createApiRuntimeEventHub();
    expect(hub.getState()).toEqual({
      authRequired: false,
      lastError: null,
      redirectTo: null,
      status: 'online',
    });

    const offline = snapshot({ kind: 'network', status: null });
    hub.emit({ type: 'network-offline', error: offline });
    expect(hub.getState()).toMatchObject({
      lastError: offline,
      status: 'offline',
    });

    const server = snapshot();
    hub.emit({ type: 'server-error', error: server });
    expect(hub.getState()).toMatchObject({
      lastError: server,
      status: 'server-error',
    });
  });

  it('keeps prior error and redirect when an auth-required event omits them', () => {
    const hub = createApiRuntimeEventHub();
    const server = snapshot();
    hub.emit({ type: 'server-error', error: server });

    hub.emit({ type: 'auth-required', reason: 'missing-token' });

    expect(hub.getState()).toMatchObject({
      authRequired: true,
      lastError: server,
      redirectTo: null,
    });
  });

  it('applies the auth error and redirect target when provided', () => {
    const hub = createApiRuntimeEventHub();
    const authError = snapshot({ kind: 'auth', status: 401 });

    hub.emit({
      type: 'auth-required',
      error: authError,
      reason: 'refresh-failed',
      redirectTo: '/login',
    });

    expect(hub.getState()).toMatchObject({
      authRequired: true,
      lastError: authError,
      redirectTo: '/login',
    });

    hub.clearAuthRequired();
    expect(hub.getState()).toMatchObject({
      authRequired: false,
      redirectTo: null,
    });
  });

  it('clears stale connectivity errors after a successful request without clearing auth state', () => {
    const hub = createApiRuntimeEventHub();
    hub.emit({ type: 'server-error', error: snapshot() });
    hub.emit({ type: 'auth-required', reason: 'retry-rejected', redirectTo: '/auth' });

    hub.emit({ type: 'request-succeeded' });

    expect(hub.getState()).toEqual({
      authRequired: true,
      lastError: null,
      redirectTo: '/auth',
      status: 'online',
    });
  });

  it('notifies subscribers until they unsubscribe and resets to the initial state', () => {
    const hub = createApiRuntimeEventHub();
    const listener = vi.fn();
    const unsubscribe = hub.subscribe(listener);

    hub.emit({
      type: 'toast',
      toast: { category: 'info', id: 't1', title: 'Hi' },
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    hub.emit({
      type: 'toast',
      toast: { category: 'info', id: 't2', title: 'Bye' },
    });
    expect(listener).toHaveBeenCalledTimes(1);

    hub.emit({ type: 'network-offline', error: snapshot({ kind: 'network' }) });
    expect(hub.getState().status).toBe('offline');

    hub.reset();
    expect(hub.getState()).toEqual({
      authRequired: false,
      lastError: null,
      redirectTo: null,
      status: 'online',
    });
  });
});
