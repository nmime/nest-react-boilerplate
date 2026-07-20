import { EventEmitter } from 'node:events';
import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  createLogger,
  createRequestLoggerMiddleware,
  redactProtectedVariables,
  redactSensitiveString,
  RedactedValue,
  StructuredConsoleLogger,
  type RequestLogLike,
  type ResponseLogLike,
} from './logger.factory';

class TestResponse extends EventEmitter implements ResponseLogLike {
  readonly headers = new Map<string, string>();
  statusCode = 200;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

const withJsonLogger = () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.env.LOG_FORMAT = 'json';

  return { stderr, stdout };
};

const firstStdoutJson = (stdout: MockInstance<typeof process.stdout.write>) =>
  JSON.parse(String(stdout.mock.calls[0]?.[0]).trim()) as Record<string, unknown>;

const createTestLogger = (log = vi.fn()): LoggerService => ({
  error: vi.fn(),
  log,
  warn: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-02T03:04:05.006Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.LOG_FORMAT;
  delete process.env.LOGGER_FORMAT;
  delete process.env.LOG_LEVEL;
});

describe('redactSensitiveString', () => {
  it('redacts protected values from plain strings', () => {
    expect(redactSensitiveString('authorization=abc token=abc123 password:super-secret ok=true')).toBe(
      `authorization=${RedactedValue} token=${RedactedValue} password:${RedactedValue} ok=true`,
    );
  });

  it('redacts bearer credentials without removing safe text', () => {
    expect(redactSensitiveString('Authorization: Bearer abc.def.ghi')).toBe(
      `Authorization: ${RedactedValue} ${RedactedValue}`,
    );
  });
});

describe('redactProtectedVariables', () => {
  it('redacts protected object fields deeply and preserves safe values', () => {
    expect(
      redactProtectedVariables({
        nested: {
          accessToken: 'abc',
          safe: 'visible',
        },
        query: 'api_key=abc&value=1',
      }),
    ).toEqual({
      nested: {
        accessToken: RedactedValue,
        safe: 'visible',
      },
      query: `api_key=${RedactedValue}&value=1`,
    });
  });

  it('redacts only whole protected tokens and leaves lookalike keys intact', () => {
    expect(
      redactProtectedVariables({
        accessToken: 'abc',
        apiKey: 'xyz',
        consideration: 'approved',
        residentId: 42,
      }),
    ).toEqual({
      accessToken: RedactedValue,
      apiKey: RedactedValue,
      consideration: 'approved',
      residentId: 42,
    });
  });

  it('serializes Error instances with redacted message, stack, cause, and code', () => {
    const error = new Error('failed password=secret', {
      cause: new Error('cause token=abc'),
    });
    error.stack = 'Error: failed password=secret\n    at test';
    Object.assign(error, { code: 'token=abc', statusCode: 500 });

    expect(redactProtectedVariables(error)).toEqual({
      cause: {
        cause: undefined,
        code: undefined,
        message: `cause token=${RedactedValue}`,
        name: 'Error',
        stack: expect.any(String) as string,
        status: undefined,
        statusCode: undefined,
      },
      code: `token=${RedactedValue}`,
      message: `failed password=${RedactedValue}`,
      name: 'Error',
      stack: `Error: failed password=${RedactedValue}\n    at test`,
      status: undefined,
      statusCode: 500,
    });
  });
});

describe('StructuredConsoleLogger', () => {
  it('emits structured JSON for object, string, and Error messages', () => {
    const { stderr, stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger('api');

    logger.log({ message: 'created', requestId: 'req-1', token: 'abc' });
    logger.warn('token=abc visible');
    logger.error(new Error('password=secret'));

    expect(stdout).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(firstStdoutJson(stdout)).toMatchObject({
      appName: 'api',
      level: 'log',
      message: 'created',
      requestId: 'req-1',
      timestamp: '2024-01-02T03:04:05.006Z',
      token: RedactedValue,
    });
    expect(JSON.parse(String(stdout.mock.calls[1]?.[0]))).toMatchObject({
      level: 'warn',
      message: `token=${RedactedValue} visible`,
    });
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      level: 'error',
      message: `password=${RedactedValue}`,
    });
  });

  it('treats a common LOG_LEVEL value like "info" as enabled instead of silencing every log', () => {
    const { stderr, stdout } = withJsonLogger();
    process.env.LOG_LEVEL = 'info';
    const logger = new StructuredConsoleLogger('api');

    logger.error('boom');
    logger.log('hello');
    logger.debug('noisy');

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledTimes(1);
  });

  it('honors configured log levels for compatibility with Nest ConsoleLogger', () => {
    const { stderr, stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger('api');

    logger.setLogLevels(['error']);
    logger.warn('hidden');
    logger.error('visible');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
  });
});

describe('createRequestLoggerMiddleware', () => {
  it('adds request id context and logs completed requests', () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(createTestLogger(log), 'api', 'x-correlation-id');
    const response = new TestResponse();
    const next = vi.fn();

    middleware(
      {
        headers: {
          'x-correlation-id': 'req-1',
          'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        },
        method: 'GET',
        originalUrl: '/users?token=abc',
      },
      response,
      next,
    );

    response.statusCode = 201;
    vi.advanceTimersByTime(25);
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.headers.get('x-correlation-id')).toBe('req-1');
    expect(log).toHaveBeenCalledWith({
      appName: 'api',
      durationMs: 25,
      ip: '203.0.113.10',
      method: 'GET',
      path: '/users?token=abc',
      requestId: 'req-1',
      status: 201,
    });
  });

  it('suppresses health check and favicon request logging', () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(createTestLogger(log), 'api');

    for (const path of ['/health', '/readyz?full=true', '/favicon.ico']) {
      const response = new TestResponse();
      middleware({ method: 'GET', originalUrl: path }, response, vi.fn());
      response.emit('finish');
    }

    expect(log).not.toHaveBeenCalled();
  });
});

describe('createLogger', () => {
  it('preserves the public factory API', () => {
    const { logger, middlewares } = createLogger({
      levels: ['error', 'warn'],
      name: 'api',
      requestIdHeader: 'x-correlation-id',
    });

    expect(logger).toBeInstanceOf(StructuredConsoleLogger);
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(middlewares).toHaveLength(1);
    expect(typeof middlewares[0]).toBe('function');
  });

  it('keeps middleware compatible with Express-style request/response objects', () => {
    const { middlewares } = createLogger({ name: 'api' });
    const response = new TestResponse();
    const request: RequestLogLike = {
      headers: {},
      method: 'POST',
      path: '/compat',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const next = vi.fn();

    middlewares[0]?.(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.headers.get('x-request-id')).toEqual(expect.any(String));
  });
});

describe('redactProtectedVariables value kinds', () => {
  it('stringifies bigint values', () => {
    expect(redactProtectedVariables<unknown>(9007199254740993n)).toBe('9007199254740993');
  });

  it('serializes Date values to ISO strings', () => {
    expect(redactProtectedVariables(new Date('2024-01-02T03:04:05.006Z'))).toBe('2024-01-02T03:04:05.006Z');
  });

  it('redacts array elements while preserving safe entries', () => {
    expect(redactProtectedVariables(['token=abc', 'safe', { password: 'p' }])).toEqual([
      `token=${RedactedValue}`,
      'safe',
      { password: RedactedValue },
    ]);
  });

  it('truncates structures nested beyond the maximum redaction depth', () => {
    let deep: unknown = { leaf: 'value' };
    for (let index = 0; index < 10; index += 1) {
      deep = { nested: deep };
    }

    expect(JSON.stringify(redactProtectedVariables(deep))).toContain('[max-depth]');
  });
});

describe('redactSensitiveString truncation', () => {
  it('truncates strings longer than the maximum length', () => {
    const long = 'a'.repeat(9_000);
    const result = redactSensitiveString(long);

    expect(result).toContain('…[truncated]');
    expect(result.length).toBeLessThan(long.length);
  });
});

describe('StructuredConsoleLogger message normalization', () => {
  it('wraps primitive messages under a value field', () => {
    const { stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger('api');

    logger.log(42);

    expect(firstStdoutJson(stdout)).toMatchObject({
      level: 'log',
      message: '42',
      value: 42,
    });
  });

  it('stringifies the whole payload when the message field is not a string', () => {
    const { stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger('api');

    logger.log({ code: 7, message: 500 });

    const entry = firstStdoutJson(stdout);

    expect(entry.code).toBe(7);
    expect(entry.message).toBe(JSON.stringify({ code: 7, message: 500 }));
  });

  it('routes verbose to stdout and fatal to stderr in JSON mode', () => {
    const { stderr, stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger('api');

    logger.verbose('chatty');
    logger.fatal('boom');

    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      level: 'verbose',
      message: 'chatty',
    });
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      level: 'fatal',
      message: 'boom',
    });
  });

  it('includes a distinct stack and omits it when it equals the context', () => {
    const { stderr } = withJsonLogger();
    const logger = new StructuredConsoleLogger('api');

    logger.error('failed', 'stack-trace', 'ctx');
    logger.error('again', 'same');

    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      context: 'ctx',
      level: 'error',
      message: 'failed',
      stack: 'stack-trace',
    });

    const second = JSON.parse(String(stderr.mock.calls[1]?.[0])) as Record<string, unknown>;

    expect(second).not.toHaveProperty('stack');
    expect(second).toMatchObject({ context: 'same', message: 'again' });
  });
});

describe('StructuredConsoleLogger pretty output', () => {
  it('delegates each level to the matching Nest ConsoleLogger method', () => {
    process.env.LOG_FORMAT = 'pretty';
    const fatal = vi.spyOn(ConsoleLogger.prototype, 'fatal').mockImplementation(() => undefined);
    const error = vi.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(() => undefined);
    const debug = vi.spyOn(ConsoleLogger.prototype, 'debug').mockImplementation(() => undefined);
    const verbose = vi.spyOn(ConsoleLogger.prototype, 'verbose').mockImplementation(() => undefined);
    const log = vi.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(() => undefined);

    const logger = new StructuredConsoleLogger('api');
    logger.fatal('boom');
    logger.error('bad');
    logger.warn('careful');
    logger.debug('trace');
    logger.verbose('chatty');
    logger.log('hello');

    expect(fatal).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(verbose).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain('"message":"hello"');
  });
});

describe('LOG_LEVEL configuration', () => {
  it('honors a real Nest level name and filters lower-priority levels', () => {
    const { stdout } = withJsonLogger();
    process.env.LOG_LEVEL = 'debug';
    const logger = new StructuredConsoleLogger('api');

    logger.debug('shown');
    logger.verbose('hidden');

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(firstStdoutJson(stdout)).toMatchObject({
      level: 'debug',
      message: 'shown',
    });
  });

  it('warns once and falls back to the default level for an unknown LOG_LEVEL', () => {
    const { stderr, stdout } = withJsonLogger();
    process.env.LOG_LEVEL = 'totally-bogus';
    const logger = new StructuredConsoleLogger('api');

    logger.log('first');
    logger.log('second');

    // "log" is the default fallback level, so both messages reach stdout.
    expect(stdout).toHaveBeenCalledTimes(2);

    const warnings = stderr.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes('Unknown LOG_LEVEL'));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('totally-bogus');
  });
});

describe('createRequestLoggerMiddleware IP and path resolution', () => {
  it('uses request.ip and request.url when no forwarded header is present', () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(createTestLogger(log), 'api');
    const response = new TestResponse();

    middleware({ headers: {}, ip: '198.51.100.5', method: 'GET', url: '/via-url?x=1' }, response, vi.fn());
    response.emit('finish');

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ ip: '198.51.100.5', path: '/via-url?x=1' }));
  });

  it('falls back to the socket remote address when neither header nor ip is set', () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(createTestLogger(log), 'api');
    const response = new TestResponse();

    middleware(
      {
        method: 'POST',
        path: '/socket-only',
        socket: { remoteAddress: '127.0.0.1' },
      },
      response,
      vi.fn(),
    );
    response.emit('finish');

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ ip: '127.0.0.1', path: '/socket-only' }));
  });

  it('logs an empty path and undefined ip when the request carries no location info', () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(createTestLogger(log), 'api');
    const response = new TestResponse();

    middleware({ method: 'GET' }, response, vi.fn());
    response.emit('finish');

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ ip: undefined, path: '' }));
  });

  it('reads the request id from an array-valued header', () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(createTestLogger(log), 'api');
    const response = new TestResponse();

    middleware(
      {
        headers: { 'x-request-id': ['first-id', 'second-id'] },
        method: 'GET',
        originalUrl: '/arr',
      },
      response,
      vi.fn(),
    );
    response.emit('finish');

    expect(response.headers.get('x-request-id')).toBe('first-id');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'first-id' }));
  });
});
