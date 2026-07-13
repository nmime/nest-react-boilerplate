import { BadRequestException, HttpStatus, Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Exception, BaseException, ExceptionKind } from '@app/backend-common-exception';
import {
  createOkResponse,
  createProblemResponse,
  isOkResponse,
  isProblemResponse,
  mapResultToResponse,
  mapValueToApiResponse,
  ExceptionsFilter,
  ExceptionsResponseTransformer,
} from './index';

const testValue = <T>(value: unknown): T => value as T;

const muteExceptionLogger = (): (() => void) => {
  const errorSpy = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const debugSpy = vi
    .spyOn(Logger.prototype, 'debug')
    .mockImplementation(() => undefined);

  return () => {
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  };
};

describe('exceptions response mapper', () => {
  it('wraps successful data', () => {
    expect(createOkResponse({ status: 'ok' })).toEqual({
      data: { status: 'ok' },
    });
  });

  it('creates RFC 9457 problem details without message parameter', () => {
    expect(createProblemResponse('bad-request')).toMatchObject({
      code: 'bad-request',
      detail: 'Bad Request',
      status: 400,
      title: 'Bad Request',
      type: 'urn:problem:nest-react-boilerplate:bad-request',
    });
  });

  it('maps neverthrow results to API responses', () => {
    expect(mapResultToResponse(ok('ready'))).toEqual({ data: 'ready' });
    expect(
      mapResultToResponse(err({ code: 'disabled', message: 'OAuth disabled' })),
    ).toMatchObject({
      code: 'disabled',
      detail: 'Bad Request',
      status: 400,
      title: 'Bad Request',
    });

    const ConflictException = Exception({
      name: 'ConflictException',
      kind: ExceptionKind.Client,
      problemType: 'conflict',
      title: 'Conflict',
      detail: 'Resource conflict',
      status: HttpStatus.CONFLICT,
    });
    expect(
      mapResultToResponse(
        err(new ConflictException({ data: { resource: 'user' } })),
      ),
    ).toMatchObject({ code: 'conflict', status: 409, title: 'Conflict' });

    // Error.message is NEVER exposed — static generic
    expect(mapResultToResponse(err(new Error('Boom')))).toMatchObject({
      code: 'bad_request',
      detail: 'Bad Request',
      status: 400,
      title: 'Bad Request',
      type: 'urn:problem:nest-react-boilerplate:bad_request',
    });
  });

  it('detects already mapped responses and maps result values', () => {
    expect(isOkResponse({ data: 'value' })).toBe(true);
    expect(
      isProblemResponse({ type: 'about:blank', title: 'Bad', status: 400 }),
    ).toBe(true);
    expect(mapValueToApiResponse({ data: 'value' })).toEqual({ data: 'value' });
    expect(mapValueToApiResponse(ok('value'))).toEqual({ data: 'value' });
    expect(mapValueToApiResponse('raw')).toBe('raw');
  });

  it('intercepts successful values and preserves thrown errors', async () => {
    const transformer = new ExceptionsResponseTransformer();
    const context = testValue<Parameters<typeof transformer.intercept>[0]>({});
    await expect(
      lastValueFrom(
        transformer.intercept(context, { handle: () => of(ok('ready')) }),
      ),
    ).resolves.toEqual({ data: 'ready' });
    await expect(
      lastValueFrom(
        transformer.intercept(context, {
          handle: () => throwError(() => new Error('boom')),
        }),
      ),
    ).rejects.toThrow('boom');
  });

  it('filters exceptions into problem+json responses', () => {
    const restoreLogger = muteExceptionLogger();
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/bad' }),
        getResponse: () => ({ status }),
      }),
    };

    try {
      new ExceptionsFilter().catch(
        new BadRequestException('Invalid input'),
        host as never,
      );

      expect(status).toHaveBeenCalledWith(400);
      expect(type).toHaveBeenCalledWith('application/problem+json');
      const badRequestBody: unknown = json.mock.calls[0]?.[0];
      expect(badRequestBody).not.toHaveProperty('instance');
      expect(badRequestBody).toMatchObject({
        code: 'bad-request',
        status: 400,
        title: 'Bad Request',
      });
    } finally {
      restoreLogger();
    }
  });

  it('supports Fastify replies that send instead of json', () => {
    const restoreLogger = muteExceptionLogger();
    const send = vi.fn();
    const header = vi.fn(() => ({ send }));
    const type = vi.fn(() => ({ header, send }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/fastify' }),
        getResponse: () => ({ status }),
      }),
    };

    try {
      new ExceptionsFilter().catch(new Error('boom'), host as never);

      expect(status).toHaveBeenCalledWith(500);
      expect(type).toHaveBeenCalledWith('application/problem+json');
      expect(header).toHaveBeenCalledWith('content-language', 'en');
      const fastifyBody: unknown = send.mock.calls[0]?.[0];
      expect(fastifyBody).not.toHaveProperty('instance');
      expect(fastifyBody).toMatchObject({
        status: 500,
        title: 'Internal Server Error',
      });
    } finally {
      restoreLogger();
    }
  });

  it('logs 500 responses with the exception stack for production traceability', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/boom' }),
        getResponse: () => ({ status }),
      }),
    };
    const boom = new Error('kaboom');

    new ExceptionsFilter().catch(boom, host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('500'),
      boom.stack,
    );
    expect(debugSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('logs expected 4xx problems at debug without error noise', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/bad' }),
        getResponse: () => ({ status }),
      }),
    };

    new ExceptionsFilter().catch(
      new BadRequestException('Invalid input'),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('does not use request.url as a problem instance', () => {
    const restoreLogger = muteExceptionLogger();
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/fallback-url' }),
        getResponse: () => ({ status }),
      }),
    };

    try {
      new ExceptionsFilter().catch(new Error('boom'), host as never);

      const fallbackBody: unknown = json.mock.calls[0]?.[0];
      expect(fallbackBody).not.toHaveProperty('instance');
      expect(fallbackBody).toMatchObject({
        status: 500,
        title: 'Internal Server Error',
      });
    } finally {
      restoreLogger();
    }
  });

  it('sets x-request-id header and instance from request headers', () => {
    const restoreLogger = muteExceptionLogger();
    const json = vi.fn();
    const header = vi.fn(() => ({ json }));
    const type = vi.fn(() => ({ header, json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: '/test',
          headers: { 'x-request-id': 'test-req-123' },
        }),
        getResponse: () => ({ status }),
      }),
    };

    try {
      new ExceptionsFilter().catch(
        new BadRequestException('test'),
        host as never,
      );

      expect(header).toHaveBeenCalledWith('x-request-id', 'test-req-123');
    } finally {
      restoreLogger();
    }
  });
});
