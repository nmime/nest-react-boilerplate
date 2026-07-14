import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRuntimeEvents, createApiRuntimeEventHub } from './runtime-events';
import type { NormalizedApiErrorSnapshot } from './runtime-events';
import {
  clearApiAuthRequired,
  hasBrowserWindow,
  resetApiRuntimeForOnline,
  useApiRuntimeOverlayModel,
} from './runtime-react';
import { ApiToastRuntime } from './toast-runtime';

const snapshot = (overrides: Partial<NormalizedApiErrorSnapshot> = {}): NormalizedApiErrorSnapshot => ({
  code: 'http.500',
  endpoint: '/profile',
  id: 'GET:/profile:500:http.500',
  kind: 'server',
  message: 'boom',
  method: 'GET',
  status: 500,
  ...overrides,
});

afterEach(() => {
  cleanup();
  apiRuntimeEvents.reset();
});

describe('resetApiRuntimeForOnline', () => {
  it('resets a provided hub and defaults to the shared hub', () => {
    const hub = createApiRuntimeEventHub();
    hub.emit({ type: 'network-offline', error: snapshot({ kind: 'network' }) });
    resetApiRuntimeForOnline(hub);
    expect(hub.getState().status).toBe('online');

    apiRuntimeEvents.emit({
      type: 'network-offline',
      error: snapshot({ kind: 'network' }),
    });
    resetApiRuntimeForOnline();
    expect(apiRuntimeEvents.getState().status).toBe('online');
  });
});

describe('clearApiAuthRequired', () => {
  it('clears the auth flag on a provided hub and defaults to the shared hub', () => {
    const hub = createApiRuntimeEventHub();
    hub.emit({
      type: 'auth-required',
      reason: 'missing-token',
      redirectTo: '/login',
    });
    clearApiAuthRequired(hub);
    expect(hub.getState()).toMatchObject({
      authRequired: false,
      redirectTo: null,
    });

    apiRuntimeEvents.emit({ type: 'auth-required', reason: 'missing-token' });
    clearApiAuthRequired();
    expect(apiRuntimeEvents.getState().authRequired).toBe(false);
  });
});

describe('useApiRuntimeOverlayModel', () => {
  it('renders with the shared runtime dependencies by default', () => {
    const { result } = renderHook(() => useApiRuntimeOverlayModel());

    expect(result.current.dismissToast).toBeInstanceOf(Function);
    expect(result.current.state.status).toBe('online');
    expect(Array.isArray(result.current.toasts)).toBe(true);
  });

  it('re-renders and reflects hub state when events are emitted', () => {
    const eventHub = createApiRuntimeEventHub();
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const { result } = renderHook(() => useApiRuntimeOverlayModel({ eventHub, toastRuntime }));

    expect(result.current.state.status).toBe('online');

    act(() => {
      eventHub.emit({ type: 'server-error', error: snapshot() });
    });

    expect(result.current.state.status).toBe('server-error');
  });

  it('reacts to browser offline and online events', () => {
    const eventHub = createApiRuntimeEventHub();
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const { result } = renderHook(() => useApiRuntimeOverlayModel({ eventHub, toastRuntime }));

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.state.status).toBe('offline');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.state.status).toBe('online');
  });

  it('emits an offline event on mount when navigator is already offline', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    try {
      const eventHub = createApiRuntimeEventHub();
      const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
      const { result } = renderHook(() => useApiRuntimeOverlayModel({ eventHub, toastRuntime }));

      expect(result.current.state.status).toBe('offline');
    } finally {
      if (descriptor) {
        Object.defineProperty(Navigator.prototype, 'onLine', descriptor);
      }
      delete (navigator as { onLine?: boolean }).onLine;
    }
  });

  it('removes the browser listeners on unmount', () => {
    const eventHub = createApiRuntimeEventHub();
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const { result, unmount } = renderHook(() => useApiRuntimeOverlayModel({ eventHub, toastRuntime }));

    unmount();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    // Listener was torn down, so the hub is untouched after unmount.
    expect(result.current.state.status).toBe('online');
    expect(eventHub.getState().status).toBe('online');
  });

  it('detects when browser window wiring is unavailable', () => {
    vi.stubGlobal('window', undefined);

    try {
      expect(hasBrowserWindow()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('dismisses a toast and re-renders the visible list', () => {
    const eventHub = createApiRuntimeEventHub();
    const toastRuntime = new ApiToastRuntime({
      clock: () => 1,
      createId: () => 'toast-1',
    });
    toastRuntime.show({ category: 'info', title: 'Hello' });

    const { result } = renderHook(() => useApiRuntimeOverlayModel({ eventHub, toastRuntime }));

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.dismissToast('toast-1');
    });

    expect(result.current.toasts).toHaveLength(0);
  });
});
