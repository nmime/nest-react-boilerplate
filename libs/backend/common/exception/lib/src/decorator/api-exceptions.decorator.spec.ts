import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ProblemTypeCode } from '@app/common-problem-details';
import { ApiExceptions, ApiProblemTypes } from './api-exceptions.decorator';

describe('ApiExceptions', () => {
  it('builds a decorator from individual status codes', () => {
    expect(ApiExceptions(HttpStatus.BAD_REQUEST, 599)).toEqual(expect.any(Function));
  });

  it('flattens arrays of status codes into a single decorator', () => {
    expect(ApiExceptions([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED])).toEqual(expect.any(Function));
  });

  it('builds response decorators from registered problem types', () => {
    expect(ApiProblemTypes('step-up-required', 'last-auth-method-unlink-forbidden')).toEqual(expect.any(Function));
    expect(ApiProblemTypes('resource-conflict', 'last-auth-method-unlink-forbidden')).toEqual(expect.any(Function));
    expect(() => ApiProblemTypes('unknown' as ProblemTypeCode)).toThrow('Unknown registered problem type');
  });
});
