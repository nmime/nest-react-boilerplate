import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Exception, getExceptionDefinition } from './base.exception';

describe('BaseException / Exception factory', () => {
  it('resolves custom type identity from the shared registry and exposes only explicit extensions', () => {
    const cause = new Error('root cause');
    const ResourceConflictException = Exception({
      name: 'ResourceConflictException',
      kind: 'client',
      problemType: 'resource-conflict',
    });
    const exception = new ResourceConflictException({
      cause,
      extensions: { resourceType: 'user' },
      meta: { databaseKey: 'secret' },
    });

    expect(exception.toProblemDetails()).toEqual({
      type: 'https://example.com/problems#resource-conflict',
      title: 'Resource Conflict',
      status: 409,
      detail: 'The request conflicts with the current state of the resource.',
      resourceType: 'user',
      code: 'resource-conflict',
    });
    expect(exception.cause).toBe(cause);
    expect(exception.toProblemDetails()).not.toHaveProperty('meta');
  });

  it('uses about:blank and status semantics when no custom type is declared', () => {
    const BadRequestException = Exception({
      name: 'BadRequestException',
      kind: 'client',
      status: HttpStatus.BAD_REQUEST,
    });

    expect(new BadRequestException().toProblemDetails()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
    });
  });

  it('publishes the resolved immutable definition', () => {
    const TestException = Exception({
      name: 'TestException',
      kind: 'server',
      status: 500,
    });

    expect(getExceptionDefinition(TestException)).toEqual({
      name: 'TestException',
      kind: 'server',
      type: 'about:blank',
      title: 'Internal Server Error',
      defaultDetail: undefined,
      status: 500,
      problemType: undefined,
      extensionsType: undefined,
    });
  });

  it('rejects undocumented custom types, status drift, and kind/status mismatches', () => {
    expect(() => Exception({ name: 'Unknown', kind: 'client', problemType: 'unknown' as 'resource-conflict' })).toThrow(
      'not documented',
    );
    expect(() => Exception({ name: 'Drift', kind: 'client', problemType: 'resource-conflict', status: 400 })).toThrow(
      'must use status 409',
    );
    expect(() => Exception({ name: 'WrongKind', kind: 'client', status: 500 })).toThrow('between 400 and 499');
  });

  it('rejects undeclared public extension members', () => {
    const ConflictException = Exception({
      name: 'ConflictException',
      kind: 'client',
      problemType: 'resource-conflict',
    });
    expect(() => new ConflictException({ extensions: { secret: 'nope' } })).toThrow('does not declare extension');
  });
});
