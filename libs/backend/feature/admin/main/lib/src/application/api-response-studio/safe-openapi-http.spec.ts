/* eslint-disable sonarjs/no-hardcoded-ip -- Public and loopback addresses are controlled network test fixtures. */
// @requirements REQ-API-RESPONSE-STUDIO-003
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NodeDnsPort,
  SafeOpenApiFetcher,
  UndiciHttpPort,
  createPinnedLookup,
  type ApiResponseStudioHttpResponse,
} from './safe-openapi-fetcher';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OpenAPI HTTP response ownership', () => {
  it('returns a streaming body before closing its connection and releases it after consumption', async () => {
    const payload = JSON.stringify({ openapi: '3.1.0', description: 'x'.repeat(256 * 1024) });
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('set-cookie', ['first=one', 'second=two']);
      response.end(payload);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener.');
    }
    let response: ApiResponseStudioHttpResponse | undefined;
    try {
      const http = new UndiciHttpPort();
      response = await http.request({
        url: new URL(`http://localhost:${address.port}`),
        addresses: ['127.0.0.1'],
        signal: AbortSignal.timeout(5000),
        headers: { accept: 'application/json' },
      });
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe(payload);
      expect(response.headers['content-type']).toBe('application/json');
      expect(response.headers['set-cookie']).toBe('first=one, second=two');
    } finally {
      await response?.dispose?.();
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    }
  });

  it('closes rejected connections and refuses requests without validated addresses', async () => {
    const http = new UndiciHttpPort();
    const input = { url: new URL('http://127.0.0.1:1'), signal: AbortSignal.timeout(500), headers: {} };
    await expect(http.request({ ...input, addresses: [] })).rejects.toThrow('No validated source address');
    await expect(http.request({ ...input, addresses: ['127.0.0.1'] })).rejects.toThrow();
    expect(await new NodeDnsPort().lookup('localhost')).not.toHaveLength(0);
  });

  it.each([200, 302, 403])(
    'disposes status %s bodies on success, redirects, and validation failures',
    async (status) => {
      const dispose = vi.fn(() => Promise.resolve());
      const http = {
        request: vi.fn(() =>
          Promise.resolve({
            status,
            headers: { 'content-type': 'application/json', location: 'https://api.example.test/spec.json' },
            body: {
              async *[Symbol.asyncIterator]() {
                yield Buffer.from('{"openapi":"3.1.0"}');
              },
            },
            dispose,
          }),
        ),
      };
      const fetcher = new SafeOpenApiFetcher({ lookup: () => Promise.resolve(['93.184.216.34']) }, http, {
        allowedHosts: ['api.example.test'],
        maxRedirects: 0,
      });
      const request = fetcher.fetchJson('https://api.example.test/spec.json');
      if (status === 200) {
        await expect(request).resolves.toEqual({ openapi: '3.1.0' });
      } else {
        await expect(request).rejects.toThrow();
      }
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it('reads the configured source allowlist and rejects unlisted hosts', async () => {
    vi.stubEnv('API_RESPONSE_STUDIO_ALLOWED_HOSTS', ' api.example.test , ');
    const fetcher = new SafeOpenApiFetcher();
    await expect(fetcher.fetchJson('https://unlisted.example.test/spec.json')).rejects.toThrow('not allowed');
  });
});

it('reports a family mismatch without retrying an unvalidated address', () => {
  const callback = vi.fn();
  createPinnedLookup(['93.184.216.34'])('example.test', { family: 6, all: true }, callback);
  expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'ENOTFOUND' }), [], 6);
  createPinnedLookup([])('example.test', {}, callback);
  expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'ENOTFOUND' }), '', undefined);
});
it('accepts a JSON schema reference without requiring an OpenAPI root document', async () => {
  const http = {
    request: vi.fn(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{"type":"object"}');
        },
      },
    })),
  };
  const fetcher = new SafeOpenApiFetcher({ lookup: async () => ['93.184.216.34'] }, http, {
    allowedHosts: ['api.example.test'],
  });
  await expect(fetcher.fetchJsonReference('https://api.example.test/schema.json')).resolves.toEqual({ type: 'object' });
  await expect(fetcher.fetchJson('https://api.example.test/schema.json')).rejects.toThrow('OpenAPI 3.x');
  await expect(fetcher.fetchJson('https://api.example.test/schema.json', { maxRedirects: -1 })).rejects.toThrow(
    'redirect is invalid',
  );
});
