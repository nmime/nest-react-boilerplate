// @requirements REQ-RUNTIME-OBSERVABILITY-005
import { describe, expect, it, vi } from 'vitest';
import { createGa4MeasurementProtocolPlugin } from './ga4-measurement-protocol.plugin';

interface Ga4RequestBody {
  client_id: string;
  user_id?: string;
  timestamp_micros?: number;
  events: Array<{ name: string; params: Record<string, unknown> }>;
}

describe('createGa4MeasurementProtocolPlugin', () => {
  it('maps timestamps and context to GA4 Measurement Protocol params', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createGa4MeasurementProtocolPlugin({
      measurementId: 'G-TEST',
      apiSecret: 'test-secret',
      endpoint: 'https://www.google-analytics.com/mp/collect',
      fetch: fetcher,
    });
    const timestamp = new Date('2024-01-02T03:04:05.006Z');

    await plugin.track?.({
      event: 'order_created',
      userId: 'user-1',
      anonymousId: 'anon-1',
      source: 'backend',
      properties: {
        plan: 'pro',
        seats: 3,
        active: true,
        nested: { tier: 'gold' },
        omitted: undefined,
      },
      context: {
        requestId: 'req-1',
        nested: { traceId: 'trace-1' },
        count: 2,
        flag: false,
      },
      timestamp,
    });

    const [requestUrl, requestInit] = fetcher.mock.calls[0] ?? [];
    const body = readJsonBody<Ga4RequestBody>(requestInit);

    expect(requestUrl).toBeInstanceOf(URL);

    expect((requestUrl as URL).searchParams.get('measurement_id')).toBe('G-TEST');
    expect((requestUrl as URL).searchParams.get('api_secret')).toBe('test-secret');
    expect(body).toMatchObject({
      client_id: 'anon-1',
      user_id: 'user-1',
      timestamp_micros: timestamp.getTime() * 1000,
      events: [
        {
          name: 'order_created',
          params: {
            plan: 'pro',
            seats: 3,
            active: 'true',
            nested: JSON.stringify({ tier: 'gold' }),
            source: 'backend',
            context_requestId: 'req-1',
            context_nested: JSON.stringify({ traceId: 'trace-1' }),
            context_count: 2,
            context_flag: 'false',
          },
        },
      ],
    });
    expect(body.events[0]?.params).not.toHaveProperty('context');
    expect(body.events[0]?.params).not.toHaveProperty('omitted');
  });

  it('normalizes Date, bigint, and unserializable param values', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createGa4MeasurementProtocolPlugin({
      measurementId: 'G-TEST',
      apiSecret: 'test-secret',
      fetch: fetcher,
    });
    const occurredAt = new Date('2024-01-02T03:04:05.006Z');
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // No timestamp: exercises the toMicros() nullish path.
    await plugin.track?.({
      event: 'order_created',
      properties: {
        occurredAt,
        big: 10n,
        circular,
        infinite: Number.POSITIVE_INFINITY,
        token: Symbol('unserializable'),
      },
    });

    const [, requestInit] = fetcher.mock.calls[0] ?? [];
    const body = readJsonBody<Ga4RequestBody>(requestInit);
    const params = body.events[0]?.params;

    expect(body).not.toHaveProperty('timestamp_micros');
    expect(params?.occurredAt).toBe(occurredAt.toISOString());
    expect(params?.big).toBe('10');
    expect(params?.circular).toBe('[object Object]');
    expect(params).not.toHaveProperty('infinite');
    expect(params).not.toHaveProperty('token');
  });

  it('throws when GA4 responds with a non-2xx status', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const plugin = createGa4MeasurementProtocolPlugin({
      measurementId: 'G-TEST',
      apiSecret: 'test-secret',
      fetch: fetcher,
    });

    await expect(plugin.track?.({ event: 'order_created', timestamp: new Date() })).rejects.toThrow(
      'GA4 analytics request failed: 400',
    );
  });
});

function readJsonBody<T>(requestInit: RequestInit | undefined): T {
  if (typeof requestInit?.body !== 'string') {
    throw new TypeError('Expected fetch body to be a JSON string.');
  }

  return JSON.parse(requestInit.body) as T;
}
