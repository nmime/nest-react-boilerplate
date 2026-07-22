import type { MergedOptions } from 'openapi-fetch';
import { describe, expect, it, vi } from 'vitest';
import { FrontendErrorKey } from './error-normalization';
import { createApiResilienceMiddleware } from './resilience-middleware';
import { createApiRuntimeFetch } from './runtime-fetch';
import { createApiRuntimeEventHub } from './runtime-events';
import { ApiToastRuntime, parseApiToastRules, resolveApiToastRule } from './toast-runtime';

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
): Promise<Response | undefined> => {
  const handler = middleware.onResponse;
  if (!handler) {
    throw new Error('onResponse missing');
  }
  return (await handler({
    id: 'test',
    options: middlewareOptions,
    params: {},
    request,
    response,
    schemaPath: '/profile',
  })) as Response | undefined;
};

describe('API resilience middleware', () => {
  it('wraps generated-client fetches with offline, auth-required, toast, and enriched error handling', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1, createId: () => 'toast-auth', eventHub });
    const authFetch = createApiRuntimeFetch({
      baseFetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Sign in first' }), {
          headers: { 'content-type': 'application/json' },
          status: 401,
        }),
      ),
      emitUnauthenticatedAuthRequired: true,
      eventHub,
      toastRuntime,
    });

    const authResponse = await authFetch('https://api.example.test/profile/me');
    const authBody = (await authResponse.json()) as Record<string, unknown>;
    expect(eventHub.getState()).toMatchObject({ authRequired: true, redirectTo: '/auth' });
    expect(authBody[FrontendErrorKey]).toMatchObject({ kind: 'auth', message: 'Sign in first', status: 401 });
    expect(events).toContain('auth-required');
    eventHub.clearAuthRequired();
    expect(eventHub.getState()).toMatchObject({ authRequired: false, redirectTo: null });

    const offlineFetch = createApiRuntimeFetch({
      baseFetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')),
      eventHub,
      toastRuntime,
    });
    await expect(offlineFetch('https://api.example.test/profile/me')).rejects.toThrow(TypeError);
    expect(eventHub.getState()).toMatchObject({ status: 'offline' });
    expect(toastRuntime.visible.at(-1)).toMatchObject({ category: 'warning', title: 'You are offline' });
  });

  it('normalizes offline failures and 5xx responses into runtime events', async () => {
    const eventHub = createApiRuntimeEventHub();
    const events: string[] = [];
    eventHub.subscribe((event) => events.push(event.type));
    const toastRuntime = new ApiToastRuntime({ clock: () => 1, createId: () => 'toast-offline', eventHub });
    const middleware = createApiResilienceMiddleware({ eventHub, toastRuntime });
    const request = new Request('https://api.example.test/profile', { method: 'GET' });

    await expect(
      Promise.resolve().then(() =>
        middleware.onError?.({
          error: new TypeError('Failed to fetch'),
          id: 'test',
          options: middlewareOptions,
          params: {},
          request,
          schemaPath: '/profile',
        }),
      ),
    ).rejects.toThrow(TypeError);
    expect(eventHub.getState()).toMatchObject({ status: 'offline' });
    expect(toastRuntime.visible[0]).toMatchObject({ category: 'warning', title: 'You are offline' });

    const response = new Response(JSON.stringify({ code: 'boom', detail: 'Database down' }), {
      headers: { 'content-type': 'application/json' },
      status: 503,
      statusText: 'Service Unavailable',
    });
    const enriched = await invokeOnResponse(middleware, request, response);
    const body = (await enriched?.json()) as Record<string, unknown>;
    expect(events).toEqual(['network-offline', 'toast', 'server-error', 'toast']);
    expect(eventHub.getState()).toMatchObject({ status: 'server-error' });
    expect(body[FrontendErrorKey]).toMatchObject({
      code: 'boom',
      endpoint: '/profile',
      kind: 'server',
      message: 'Database down',
      method: 'GET',
      status: 503,
    });
  });

  it('matches toast rules from JSON and keeps at most three visible toasts', () => {
    let now = 100;
    let nextId = 0;
    const runtime = new ApiToastRuntime({
      clock: () => now,
      createId: () => {
        nextId += 1;
        return `toast-${nextId}`;
      },
    });
    const rules = parseApiToastRules([
      {
        display: 'toast',
        id: 'profile.saved',
        match: { endpoint: '/profile', method: 'PATCH', status: 200 },
        toast: { category: 'success', title: 'Profile saved' },
      },
      { id: 'invalid', match: {}, toast: { category: 'not-real' } },
    ]);
    expect(resolveApiToastRule({ endpoint: '/profile', method: 'patch', status: 200 }, rules)).toMatchObject({
      id: 'profile.saved',
    });
    expect(runtime.showForApiResult({ endpoint: '/profile', method: 'PATCH', status: 200 }, rules)).toMatchObject({
      category: 'success',
      title: 'Profile saved',
    });
    expect(runtime.showForApiResult({ endpoint: '/profile', method: 'PATCH', status: 200 }, rules)).toBeNull();

    now += 5000;
    runtime.show({ category: 'info', title: 'One' });
    runtime.show({ category: 'warning', title: 'Two' });
    runtime.show({ category: 'error', title: 'Three' });
    expect(runtime.visible).toHaveLength(3);
    expect(runtime.visible.map((toast) => toast.title)).toEqual(['One', 'Two', 'Three']);
  });
});
