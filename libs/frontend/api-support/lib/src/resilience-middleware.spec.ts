import { describe, expect, it } from 'vitest';
import type { MergedOptions } from 'openapi-fetch';

import { FrontendErrorKey } from './error-normalization';
import { createApiResilienceMiddleware } from './resilience-middleware';
import { createApiRuntimeEventHub } from './runtime-events';
import { ApiToastRuntime, parseApiToastRules } from './toast-runtime';

const middlewareOptions = {
  baseUrl: '',
  bodySerializer: (body: unknown) => JSON.stringify(body),
  fetch: globalThis.fetch,
  parseAs: 'json',
  pathSerializer: (pathname: string) => pathname,
  querySerializer: () => '',
} satisfies MergedOptions;

const invokeOnResponse = async (
  middleware: ReturnType<typeof createApiResilienceMiddleware>,
  request: Request,
  response: Response,
): Promise<Response | undefined> =>
  (await middleware.onResponse?.({
    id: 'test',
    options: middlewareOptions,
    params: {},
    request,
    response,
    schemaPath: '/profile',
  })) as Response | undefined;

const invokeOnError = async (
  middleware: ReturnType<typeof createApiResilienceMiddleware>,
  request: Request,
  error: unknown,
): Promise<Response | undefined> =>
  (await middleware.onError?.({
    error,
    id: 'test',
    options: middlewareOptions,
    params: {},
    request,
    schemaPath: '/profile',
  })) as Response | undefined;

describe('createApiResilienceMiddleware onResponse', () => {
  it('shows a success toast for <400 responses and passes them through untouched', async () => {
    const eventHub = createApiRuntimeEventHub();
    eventHub.emit({
      type: 'network-offline',
      error: {
        code: 'network.offline',
        id: 'GET:/profile:network:network.offline',
        kind: 'network',
        message: 'Offline',
        status: null,
      },
    });
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const rules = parseApiToastRules([
      {
        display: 'toast',
        id: 'profile.saved',
        match: { endpoint: 'not a url', method: 'PATCH', status: 200 },
        toast: { category: 'success', title: 'Profile saved' },
      },
    ]);
    const middleware = createApiResilienceMiddleware({
      eventHub,
      toastRules: rules,
      toastRuntime,
    });
    // A non-parseable url exercises the requestEndpoint catch fallback.
    const request = {
      method: 'PATCH',
      url: 'not a url',
    } as unknown as Request;

    const result = await invokeOnResponse(middleware, request, new Response(null, { status: 200 }));

    expect(result).toBeUndefined();
    expect(eventHub.getState()).toMatchObject({ lastError: null, status: 'online' });
    expect(toastRuntime.visible.at(-1)).toMatchObject({
      category: 'success',
      title: 'Profile saved',
    });
  });

  it('enriches non-server 4xx responses without emitting a server-error event', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const middleware = createApiResilienceMiddleware({
      eventHub,
      toastRuntime,
    });
    const request = new Request('https://api.example.test/profile', {
      method: 'GET',
    });

    const enriched = await invokeOnResponse(
      middleware,
      request,
      new Response(JSON.stringify({ detail: 'Missing' }), {
        headers: { 'content-type': 'application/json' },
        status: 404,
        statusText: 'Not Found',
      }),
    );
    const body = (await enriched?.json()) as Record<string, unknown>;

    expect(events).not.toContain('server-error');
    expect(eventHub.getState().status).toBe('online');
    expect(body[FrontendErrorKey]).toMatchObject({
      endpoint: '/profile',
      kind: 'client',
      message: 'Missing',
      status: 404,
    });
  });
});

describe('createApiResilienceMiddleware onError', () => {
  it('rethrows an AbortError without emitting network-offline', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const middleware = createApiResilienceMiddleware({ eventHub, toastRuntime });
    const request = new Request('https://api.example.test/profile', { method: 'GET' });
    const abortError = new DOMException('The operation was aborted.', 'AbortError');

    await expect(invokeOnError(middleware, request, abortError)).rejects.toBe(abortError);

    expect(events).not.toContain('network-offline');
    expect(eventHub.getState().status).toBe('online');
    expect(toastRuntime.visible).toHaveLength(0);
  });

  it('emits network-offline for a genuine network failure', async () => {
    const eventHub = createApiRuntimeEventHub();
    const toastRuntime = new ApiToastRuntime({ clock: () => 1 });
    const middleware = createApiResilienceMiddleware({ eventHub, toastRuntime });
    const request = new Request('https://api.example.test/profile', { method: 'GET' });

    await expect(invokeOnError(middleware, request, new TypeError('Failed to fetch'))).rejects.toBeInstanceOf(
      TypeError,
    );

    expect(eventHub.getState().status).toBe('offline');
  });
});
