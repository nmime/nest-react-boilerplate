import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrontendErrorKey } from './error-normalization';
import { configureApiLocale } from './api-locale';
import { apiRuntimeEvents, createApiRuntimeEventHub } from './runtime-events';
import { createApiRuntimeFetch, emitBrowserOfflineEvent } from './runtime-fetch';
import { ApiToastRuntime, parseApiToastRules } from './toast-runtime';

const jsonResponse = (body: unknown, status: number, statusText = ''): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
    statusText,
  });

afterEach(() => {
  apiRuntimeEvents.reset();
  configureApiLocale({ locale: 'en' });
});

describe('createApiRuntimeFetch success path', () => {
  it('passes 2xx responses through and shows a matching success toast', async () => {
    const eventHub = createApiRuntimeEventHub();
    eventHub.emit({
      type: 'server-error',
      error: {
        code: 'http.503',
        id: 'GET:/profile:503:http.503',
        kind: 'server',
        message: 'Down',
        status: 503,
      },
    });
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const rules = parseApiToastRules([
      {
        display: 'toast',
        id: 'ok',
        match: { status: 200 },
        toast: { category: 'success', title: 'Saved' },
      },
    ]);
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }, 200));
    const runtimeFetch = createApiRuntimeFetch({
      baseFetch,
      eventHub,
      toastRules: rules,
      toastRuntime,
    });

    const response = await runtimeFetch('https://api.example.test/profile');

    expect(response.status).toBe(200);
    expect(eventHub.getState().status).toBe('online');
    expect(eventHub.getState().lastError).toBeNull();
    expect(toastRuntime.visible.at(-1)).toMatchObject({
      category: 'success',
      title: 'Saved',
    });
  });
});

describe('createApiRuntimeFetch error paths', () => {
  it('emits a server-error event and enriches 5xx responses', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          code: 'service-unavailable',
          detail: 'Down',
          type: 'https://errors.example.test/service-unavailable',
        },
        503,
        'Unavailable',
      ),
    );
    const runtimeFetch = createApiRuntimeFetch({
      baseFetch,
      eventHub,
      toastRuntime,
    });

    const enriched = await runtimeFetch('https://api.example.test/profile');
    const body = (await enriched.json()) as Record<string, unknown>;

    expect(events).toContain('server-error');
    expect(eventHub.getState().status).toBe('server-error');
    expect(body[FrontendErrorKey]).toMatchObject({
      code: 'service-unavailable',
      kind: 'server',
      message: 'Down',
      status: 503,
      type: 'https://errors.example.test/service-unavailable',
    });
  });

  it('emits auth-required with refresh-failed when a 401 carries an Authorization header', async () => {
    const eventHub = createApiRuntimeEventHub();
    let reason: string | undefined;
    eventHub.subscribe((event) => {
      if (event.type === 'auth-required') {
        reason = event.reason;
      }
    });
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: 'Expired' }, 401));
    const runtimeFetch = createApiRuntimeFetch({
      baseFetch,
      eventHub,
      redirectTo: '/auth',
      toastRuntime,
    });

    await runtimeFetch('https://api.example.test/profile', {
      headers: { Authorization: 'Bearer stale' },
    });

    expect(eventHub.getState()).toMatchObject({
      authRequired: true,
      redirectTo: '/auth',
    });
    expect(reason).toBe('refresh-failed');
  });

  it('does not emit auth-required for an unauthenticated 401 by default', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: 'Nope' }, 401));
    const runtimeFetch = createApiRuntimeFetch({
      baseFetch,
      eventHub,
      toastRuntime,
    });

    await runtimeFetch('https://api.example.test/profile');

    expect(events).not.toContain('auth-required');
    expect(eventHub.getState().authRequired).toBe(false);
  });
});

describe('createApiRuntimeFetch thrown errors', () => {
  it('rethrows an AbortError without emitting network-offline or going offline', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const baseFetch = vi.fn<typeof fetch>().mockRejectedValue(abortError);
    const runtimeFetch = createApiRuntimeFetch({ baseFetch, eventHub, toastRuntime });

    await expect(runtimeFetch('https://api.example.test/profile')).rejects.toBe(abortError);

    expect(events).not.toContain('network-offline');
    expect(eventHub.getState().status).toBe('online');
    expect(toastRuntime.visible).toHaveLength(0);
  });

  it('emits network-offline for a genuine network failure', async () => {
    const eventHub = createApiRuntimeEventHub();
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const baseFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const runtimeFetch = createApiRuntimeFetch({ baseFetch, eventHub, toastRuntime });

    await expect(runtimeFetch('https://api.example.test/profile')).rejects.toBeInstanceOf(TypeError);

    expect(eventHub.getState().status).toBe('offline');
  });
});

describe('emitBrowserOfflineEvent', () => {
  it('marks the provided hub offline with a navigator offline snapshot', () => {
    const eventHub = createApiRuntimeEventHub();
    configureApiLocale({ locale: 'ru' });

    emitBrowserOfflineEvent(eventHub);

    expect(eventHub.getState().status).toBe('offline');
    expect(eventHub.getState().lastError).toMatchObject({
      code: 'network.offline',
      kind: 'network',
      message: 'Ошибка сетевого подключения.',
      status: null,
    });
  });

  it('defaults to the shared runtime event hub', () => {
    emitBrowserOfflineEvent();

    expect(apiRuntimeEvents.getState().status).toBe('offline');
  });
});
