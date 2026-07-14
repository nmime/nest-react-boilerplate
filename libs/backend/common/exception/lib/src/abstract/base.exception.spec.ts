import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Exception, getExceptionDefinition } from './base.exception';

describe('BaseException / Exception factory', () => {
  it('creates coded problem details via the Exception factory', () => {
    const cause = new Error('root cause');
    const DomainConflictException = Exception({
      name: 'DomainConflictException',
      kind: 'client',
      problemType: 'domain-conflict',
      title: 'Conflict',
      detail: 'Already exists',
      status: HttpStatus.CONFLICT,
    });

    const exception = new DomainConflictException({
      cause,
      data: { resource: 'user' },
    });

    expect(exception).toMatchObject({
      cause,
      code: 'domain-conflict',
      detail: 'Already exists',
      name: 'DomainConflictException',
      status: HttpStatus.CONFLICT,
      title: 'Conflict',
      type: 'urn:problem:nest-react-boilerplate:domain-conflict',
    });
    expect(exception.data).toEqual({ resource: 'user' });

    const pd = exception.toProblemDetails();
    expect(pd).toEqual({
      type: 'urn:problem:nest-react-boilerplate:domain-conflict',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: 'Already exists',
      code: 'domain-conflict',
      info: { resource: 'user' },
    });
  });

  it('omits info when data is empty', () => {
    const BadRequestEx = Exception({
      name: 'BadRequestException',
      kind: 'client',
      problemType: 'bad-request',
      title: 'Bad Request',
      detail: 'The request was invalid',
      status: HttpStatus.BAD_REQUEST,
    });

    const exception = new BadRequestEx({});
    expect(exception.toProblemDetails()).not.toHaveProperty('info');
  });

  it('getExceptionDefinition reads static definition from factory-created class', () => {
    const TestException = Exception({
      name: 'TestException',
      kind: 'server' as const,
      problemType: 'test_error',
      title: 'Test Error',
      detail: 'A test error occurred',
      status: 500,
    });

    const def = getExceptionDefinition(TestException);
    expect(def).toEqual({
      name: 'TestException',
      kind: 'server',
      problemType: 'test_error',
      title: 'Test Error',
      detail: 'A test error occurred',
      status: 500,
    });
  });

  it('defaults status based on kind when not provided', () => {
    const ClientEx = Exception({
      name: 'ClientEx',
      kind: 'client',
      problemType: 'client_error',
      title: 'Client Error',
      detail: 'Client-side error',
    });
    const ServerEx = Exception({
      name: 'ServerEx',
      kind: 'server',
      problemType: 'server_error',
      title: 'Server Error',
      detail: 'Server-side error',
    });

    const ce = new ClientEx();
    const se = new ServerEx();

    expect(ce.status).toBe(HttpStatus.BAD_REQUEST);
    expect(se.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
