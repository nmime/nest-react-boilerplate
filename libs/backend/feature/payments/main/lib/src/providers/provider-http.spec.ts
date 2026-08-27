// @requirements REQ-PAYMENT-PROVIDER-003 REQ-PAYMENT-PROVIDER-004
import { describe, expect, it, vi } from 'vitest';
import { ProviderHttpError } from '@app/backend-feature-payments-shared';
import { ProviderHttpClient } from './provider-http';

const BaseRequest = {
  providerCode: 'alpha',
  url: 'https://alpha.example.test/payments',
  policy: { timeoutMs: 1_000 },
} as const;

function harness(fetchImpl: typeof fetch, now = 0) {
  let clock = now;
  const sleep = vi.fn(async (milliseconds: number) => {
    clock += milliseconds;
  });
  const health = {
    recordSuccess: vi.fn(async () => undefined),
    recordError: vi.fn(async () => undefined),
  };
  const client = new ProviderHttpClient(health as never, {
    fetch: fetchImpl,
    now: () => clock,
    sleep,
  });
  return { client, health, sleep, clock: () => clock };
}

describe('ProviderHttpClient', () => {
  it('uses the default runtime dependencies and policy when no overrides are supplied', async () => {
    const response = new Response('{}', { status: 200 });
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const health = { recordSuccess: vi.fn(async () => undefined), recordError: vi.fn(async () => undefined) };
    const client = new ProviderHttpClient(health as never);

    await expect(client.request(BaseRequest)).resolves.toBe(response);
    expect(globalFetch).toHaveBeenCalledTimes(1);
    globalFetch.mockRestore();
  });

  it('returns a successful response and records recovery', async () => {
    const response = new Response('{}', { status: 200 });
    const fetchMock = vi.fn(async () => response) as unknown as typeof fetch;
    const { client, health } = harness(fetchMock);

    await expect(client.request(BaseRequest)).resolves.toBe(response);
    expect(health.recordSuccess).toHaveBeenCalledWith('alpha');
    expect(health.recordError).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth', false],
    [403, 'auth', false],
    [400, 'client', false],
    [404, 'client', false],
  ] as const)('classifies HTTP %s as %s without retry', async (status, errorClass, retryable) => {
    const fetchMock = vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
    const { client, health, sleep } = harness(fetchMock);

    await expect(client.request(BaseRequest)).rejects.toMatchObject({
      class: errorClass,
      providerStatus: status,
      retryable,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(health.recordError).toHaveBeenCalledWith('alpha', errorClass);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('uses the default sleep implementation for a retryable failure', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 503 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 })) as unknown as typeof fetch;
      const health = { recordSuccess: vi.fn(async () => undefined), recordError: vi.fn(async () => undefined) };
      const client = new ProviderHttpClient(health as never, { fetch: fetchMock });

      const pending = client.request({
        ...BaseRequest,
        policy: { timeoutMs: 1_000, retry: { maxAttempts: 2, backoffMs: 10 } },
      });
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toHaveProperty('status', 200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries server failures exponentially and succeeds inside the budget', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { client, health, sleep } = harness(fetchMock);

    await expect(
      client.request({
        ...BaseRequest,
        policy: { timeoutMs: 1_000, retry: { maxAttempts: 3, backoffMs: 10, maxBackoffMs: 100 } },
      }),
    ).resolves.toHaveProperty('status', 200);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
    expect(health.recordError).toHaveBeenCalledTimes(2);
    expect(health.recordSuccess).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After seconds for 429 and reports it after exhaustion', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': '2' } }),
    ) as unknown as typeof fetch;
    const { client, sleep } = harness(fetchMock);

    await expect(
      client.request({
        ...BaseRequest,
        policy: { timeoutMs: 1_000, retry: { maxAttempts: 2, backoffMs: 10 } },
      }),
    ).rejects.toMatchObject({
      class: 'rate_limited',
      providerStatus: 429,
      retryAfterSeconds: 2,
    });
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a past Retry-After date as a one-second minimum and ignores an invalid value', async () => {
    const dateFetch = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': new Date(0).toUTCString() } }),
    ) as unknown as typeof fetch;
    const dated = harness(dateFetch);
    await expect(
      dated.client.request({ ...BaseRequest, policy: { timeoutMs: 1_000, retry: { maxAttempts: 1 } } }),
    ).rejects.toMatchObject({
      retryAfterSeconds: 1,
    });

    const invalidFetch = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': 'later' } }),
    ) as unknown as typeof fetch;
    const invalid = harness(invalidFetch);
    await expect(
      invalid.client.request({ ...BaseRequest, policy: { timeoutMs: 1_000, retry: { maxAttempts: 1 } } }),
    ).rejects.toMatchObject({
      retryAfterSeconds: undefined,
    });
  });

  it('aborts a request when the local timeout expires', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        async (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
              },
              { once: true },
            );
          }),
      ) as unknown as typeof fetch;
      const { client } = harness(fetchMock);

      const pending = client.request({ ...BaseRequest, policy: { timeoutMs: 10, retry: { maxAttempts: 1 } } });
      const assertion = expect(pending).rejects.toMatchObject({ class: 'timeout' });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes an abort into a retryable timeout', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abort;
    }) as unknown as typeof fetch;
    const { client, health } = harness(fetchMock);

    await expect(
      client.request({ ...BaseRequest, policy: { timeoutMs: 1_000, retry: { maxAttempts: 1 } } }),
    ).rejects.toMatchObject({
      class: 'timeout',
      retryable: true,
    });
    expect(health.recordError).toHaveBeenCalledWith('alpha', 'timeout');
  });

  it('normalizes other thrown values into a retryable network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('socket closed');
    }) as unknown as typeof fetch;
    const { client } = harness(fetchMock);

    await expect(
      client.request({ ...BaseRequest, policy: { timeoutMs: 1_000, retry: { maxAttempts: 1 } } }),
    ).rejects.toMatchObject({
      class: 'network',
      retryable: true,
    });
  });

  it('preserves adapter-supplied ProviderHttpError classification', async () => {
    const source = new ProviderHttpError('client', 'mapped provider problem', {
      providerStatus: 422,
      problemType: 'payment-amount-invalid',
      retryable: false,
    });
    const fetchMock = vi.fn(async () => {
      throw source;
    }) as unknown as typeof fetch;
    const { client } = harness(fetchMock);

    await expect(client.request(BaseRequest)).rejects.toBe(source);
  });

  it('enforces maxConcurrency with a semaphore', async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const fetchMock = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      active -= 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const { client } = harness(fetchMock);
    const request = { ...BaseRequest, policy: { timeoutMs: 1_000, maxConcurrency: 1 } };

    const first = client.request(request);
    const second = client.request(request);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    releases.shift()?.();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    releases.shift()?.();
    await Promise.all([first, second]);

    expect(maximum).toBe(1);
  });

  it('uses a token bucket and waits for a refill before the next call', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { client, sleep, clock } = harness(fetchMock);
    const request = {
      ...BaseRequest,
      policy: {
        timeoutMs: 1_000,
        tokenBucket: { capacity: 1, refillTokens: 1, refillIntervalMs: 1_000 },
      },
    };

    await client.request(request);
    await client.request(request);

    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(clock()).toBe(1_000);
  });

  it('fails locally when sleep cannot refill the token bucket', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const health = { recordSuccess: vi.fn(), recordError: vi.fn() };
    const client = new ProviderHttpClient(health as never, {
      fetch: fetchMock,
      now: () => 0,
      sleep: vi.fn(async () => undefined),
    });
    const request = {
      ...BaseRequest,
      policy: { timeoutMs: 1_000, tokenBucket: { capacity: 1, refillTokens: 1, refillIntervalMs: 1_000 } },
    };
    await client.request(request);

    await expect(client.request(request)).rejects.toMatchObject({ class: 'rate_limited', retryAfterSeconds: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ maxConcurrency: 0 }, 'Provider maxConcurrency'],
    [{ tokenBucket: { capacity: 0, refillTokens: 1, refillIntervalMs: 1_000 } }, 'Provider token bucket'],
  ] as const)('rejects invalid local protection policy', async (policy, message) => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { client } = harness(fetchMock);

    await expect(client.request({ ...BaseRequest, policy: { timeoutMs: 1_000, ...policy } })).rejects.toThrow(message);
  });

  it('rejects a retry policy with no first attempt and the unreachable guard is explicit', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { client } = harness(fetchMock);

    await expect(
      client.request({ ...BaseRequest, policy: { timeoutMs: 1_000, retry: { maxAttempts: 0 } } }),
    ).rejects.toThrow('maxAttempts');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards external aborts and removes its listener after fetch', async () => {
    const external = new AbortController();
    const add = vi.spyOn(external.signal, 'addEventListener');
    const remove = vi.spyOn(external.signal, 'removeEventListener');
    let releaseFetch: (() => void) | undefined;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const { client } = harness(fetchMock);

    const pending = client.request({ ...BaseRequest, init: { signal: external.signal } });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    external.abort();
    releaseFetch?.();
    await pending;
    expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('reuses a provider semaphore for the same concurrency policy', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const { client } = harness(fetchMock);
    const request = { ...BaseRequest, policy: { timeoutMs: 1_000, maxConcurrency: 2 } };

    await client.request(request);
    await client.request(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
