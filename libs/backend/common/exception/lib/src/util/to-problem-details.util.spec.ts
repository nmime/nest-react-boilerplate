import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Exception } from '../abstract/base.exception';
import { ExceptionKind } from '../type/exception-kind.type';
import { createProblemDetails } from './create-problem-details.util';
import { getProblemStatus, toProblemDetails } from './to-problem-details.util';

describe('getProblemStatus / toProblemDetails', () => {
  it('derives statuses from typed exceptions, HttpException, and unknown errors', () => {
    const rawHttp = new HttpException('Nope', 418);
    const badRequest = new BadRequestException('Invalid input');

    expect(getProblemStatus(rawHttp)).toBe(418);
    expect(getProblemStatus(new Error('boom'))).toBe(500);

    // HttpException — never exposes message
    expect(toProblemDetails(badRequest)).toEqual({
      code: 'bad-request',
      detail: 'The request could not be processed.',
      type: 'urn:problem:nest-react-boilerplate:bad-request',
      title: 'Bad Request',
      status: 400,
    });

    expect(toProblemDetails(rawHttp)).toEqual({
      code: 'i-am-a-teapot',
      detail: 'I Am A Teapot',
      type: 'urn:problem:nest-react-boilerplate:i-am-a-teapot',
      title: 'I Am A Teapot',
      status: 418,
    });

    // Unknown error → generic internal
    expect(toProblemDetails('boom')).toEqual({
      code: 'internal_server_error',
      detail: 'An unexpected error occurred',
      type: 'urn:problem:nest-react-boilerplate:internal_server_error',
      title: 'Internal Server Error',
      status: 500,
    });
  });

  it('uses typed exceptions with static fields', () => {
    const TestForbidden = Exception({
      name: 'TestForbiddenException',
      kind: ExceptionKind.Client,
      problemType: 'test_forbidden',
      title: 'Forbidden',
      detail: 'You do not have permission',
      status: HttpStatus.FORBIDDEN,
    });

    const ex = new TestForbidden();
    expect(getProblemStatus(ex)).toBe(HttpStatus.FORBIDDEN);

    const problem = toProblemDetails(ex, '/req-123');
    expect(problem.type).toBe('urn:problem:nest-react-boilerplate:test_forbidden');
    expect(problem.title).toBe('Forbidden');
    expect(problem.detail).toBe('You do not have permission');
    expect(problem.status).toBe(HttpStatus.FORBIDDEN);
  });

  it('two instances with different data produce identical static fields', () => {
    const TestException = Exception({
      name: 'TestException',
      kind: ExceptionKind.Client,
      problemType: 'test_error',
      title: 'Test Error',
      detail: 'A test error occurred',
      status: 400,
    });

    const p1 = toProblemDetails(new TestException({ data: { id: 'a' } }));
    const p2 = toProblemDetails(new TestException({ data: { id: 'b' } }));

    expect(p1.type).toBe(p2.type);
    expect(p1.title).toBe(p2.title);
    expect(p1.detail).toBe(p2.detail);
    expect(p1.status).toBe(p2.status);
    expect((p1 as Record<string, unknown>).info).not.toEqual((p2 as Record<string, unknown>).info);
  });

  it('does not expose meta, cause, or stack in problem details', () => {
    const TestException = Exception({
      name: 'TestException',
      kind: ExceptionKind.Server,
      problemType: 'internal',
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
      status: 500,
    });

    const ex = new TestException({
      meta: { operation: 'do_thing', internalId: 'secret-123' },
      cause: new Error('database connection failed'),
    });

    const problem = toProblemDetails(ex);
    expect(problem).not.toHaveProperty('meta');
    expect(problem).not.toHaveProperty('cause');
    expect(problem).not.toHaveProperty('stack');
  });

  it('HttpException with problem details response passes through', () => {
    const problem = createProblemDetails({
      code: 'custom',
      detail: 'Custom detail',
      status: 409,
      title: 'Conflict',
    });
    const httpEx = new HttpException(problem, 409);

    expect(toProblemDetails(httpEx)).toMatchObject({
      code: 'custom',
      detail: 'Custom detail',
      status: 409,
      title: 'Conflict',
    });
  });

  it('instance is set by HTTP boundary, not by exception', () => {
    const TestException = Exception({
      name: 'TestException',
      kind: ExceptionKind.Client,
      problemType: 'test',
      title: 'Test',
      detail: 'Test detail',
      status: 400,
    });

    const problem = toProblemDetails(new TestException(), '/req-abc');
    // instance is a relative URI — createProblemDetails normalizes
    expect(problem).not.toHaveProperty('instance'); // "/" prefix stripped
  });

  it('unknown error type returns generic internal error', () => {
    expect(toProblemDetails(null)).toMatchObject({
      code: 'internal_server_error',
      title: 'Internal Server Error',
      status: 500,
    });

    expect(toProblemDetails(undefined)).toMatchObject({
      code: 'internal_server_error',
      title: 'Internal Server Error',
      status: 500,
    });
  });

  it('never leaks HttpException.message into detail', () => {
    const sensitive = new HttpException('password=secret123', 500);
    const problem = toProblemDetails(sensitive);
    expect(problem.detail).not.toContain('password');
    expect(problem.detail).not.toContain('secret');
  });
});
