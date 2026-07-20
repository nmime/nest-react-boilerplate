import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestLoggingMiddleware } from './request-logging.middleware';

const RequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

interface TestRequest {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  path?: string;
  url?: string;
}

interface TestResponse {
  statusCode?: number;
  on: (event: 'finish', listener: () => void) => void;
  setHeader?: (name: string, value: string) => void;
}

function createResponse(): { response: TestResponse; finish: () => void; headers: Map<string, string> } {
  let finishListener: (() => void) | undefined;
  const headers = new Map<string, string>();
  const response: TestResponse = {
    statusCode: 200,
    on: (_event, listener) => {
      finishListener = listener;
    },
    setHeader: (name, value) => {
      headers.set(name, value);
    },
  };

  return {
    response,
    headers,
    finish: () => {
      finishListener?.();
    },
  };
}

describe('createRequestLoggingMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('propagates the resolved request id onto the request so the ClsInterceptor reuses it', () => {
    const middleware = createRequestLoggingMiddleware('test-api');
    const request: TestRequest = { method: 'GET', url: '/resource' };
    const { response, headers } = createResponse();

    middleware(request, response, vi.fn());

    const headerId = headers.get('x-request-id');
    expect(headerId).toMatch(RequestIdPattern);
    // The interceptor reads request.headers['x-request-id']; it must now match the
    // id written to the response header (and used by the access log).
    expect(request.headers?.['x-request-id']).toBe(headerId);
  });

  it('overwrites an unusable inbound request id with the generated one on the request', () => {
    const middleware = createRequestLoggingMiddleware('test-api');
    const request: TestRequest = { headers: { 'x-request-id': 'not a valid id' }, method: 'GET', url: '/resource' };
    const { response, headers } = createResponse();

    middleware(request, response, vi.fn());

    const headerId = headers.get('x-request-id');
    expect(headerId).toMatch(RequestIdPattern);
    expect(headerId).not.toBe('not a valid id');
    expect(request.headers?.['x-request-id']).toBe(headerId);
  });

  it('keeps a valid inbound request id consistent across request and response', () => {
    const middleware = createRequestLoggingMiddleware('test-api');
    const request: TestRequest = { headers: { 'x-request-id': 'request-42' }, method: 'GET', url: '/resource' };
    const { response, headers } = createResponse();

    middleware(request, response, vi.fn());

    expect(headers.get('x-request-id')).toBe('request-42');
    expect(request.headers?.['x-request-id']).toBe('request-42');
  });

  it('strips the query string so secrets in query parameters never reach logs', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const middleware = createRequestLoggingMiddleware('test-api');
    const request: TestRequest = {
      headers: { 'x-request-id': 'request-1' },
      method: 'GET',
      originalUrl: '/api/auth/reset-password?token=SECRET123&code=AUTHCODE',
    };
    const { response, finish } = createResponse();

    middleware(request, response, vi.fn());
    finish();

    expect(stdout).toHaveBeenCalledTimes(1);
    const line = stdout.mock.calls[0]?.[0] as string;
    expect(line).toContain('"path":"/api/auth/reset-password"');
    expect(line).not.toContain('SECRET123');
    expect(line).not.toContain('AUTHCODE');
  });

  it('logs paths without a query string unchanged', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const middleware = createRequestLoggingMiddleware('test-api');
    const request: TestRequest = { method: 'GET', path: '/healthz' };
    const { response, finish } = createResponse();

    middleware(request, response, vi.fn());
    finish();

    const line = stdout.mock.calls[0]?.[0] as string;
    expect(line).toContain('"path":"/healthz"');
  });

  it('omits the path when no URL-like field is present', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const middleware = createRequestLoggingMiddleware('test-api');
    const request: TestRequest = { method: 'GET' };
    const { response, finish } = createResponse();

    middleware(request, response, vi.fn());
    finish();

    const line = stdout.mock.calls[0]?.[0] as string;
    expect(line).not.toContain('"path"');
  });
});
