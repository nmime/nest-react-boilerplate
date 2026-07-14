import { describe, expect, it } from 'vitest';

import { FrontendErrorKey } from './error-normalization';
import { createApiResilienceMiddleware } from './resilience-middleware';
import { createApiRuntimeEventHub } from './runtime-events';
import { ApiToastRuntime, parseApiToastRules } from './toast-runtime';

const invokeOnResponse = async (
  middleware: ReturnType<typeof createApiResilienceMiddleware>,
  request: Request,
  response: Response,
): Promise<Response | undefined> =>
  (await middleware.onResponse?.({
    id: 'test',
    options: {},
    request,
    response,
    schemaPath: '/profile',
  })) as Response | undefined;

describe('createApiResilienceMiddleware onResponse', () => {
  it('shows a success toast for <400 responses and passes them through untouched', async () => {
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
      eventHub: createApiRuntimeEventHub(),
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
