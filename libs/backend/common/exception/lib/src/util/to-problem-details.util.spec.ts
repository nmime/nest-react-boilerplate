import { BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Exception } from '../abstract/base.exception';
import { getProblemStatus, toProblemDetails } from './to-problem-details.util';

describe('getProblemStatus / toProblemDetails', () => {
  it('uses the actual HTTP status and never exposes HttpException messages or bodies', () => {
    const error = new HttpException(
      {
        type: 'https://attacker.invalid/problems#spoofed',
        title: 'Spoofed',
        status: 500,
        detail: 'password=secret',
        stack: 'private',
      },
      409,
    );

    expect(getProblemStatus(error)).toBe(409);
    expect(toProblemDetails(error)).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'The request conflicts with the current state of the resource.',
    });
    expect(JSON.stringify(toProblemDetails(new BadRequestException('secret')))).not.toContain('secret');
  });

  it('serializes registered factory exceptions and occurrence instances', () => {
    const ConflictException = Exception({
      name: 'ConflictException',
      kind: 'client',
      problemType: 'resource-conflict',
    });
    const problem = toProblemDetails(
      new ConflictException({ extensions: { resourceType: 'account' }, meta: { secret: true } }),
      'https://example.com/problem-instances/request-1',
    );

    expect(problem).toMatchObject({
      type: 'https://example.com/problems#resource-conflict',
      status: 409,
      instance: 'https://example.com/problem-instances/request-1',
      resourceType: 'account',
      code: 'resource-conflict',
    });
    expect(problem).not.toHaveProperty('meta');
  });

  it('maps unknown failures to a safe about:blank 500 response', () => {
    expect(toProblemDetails(new Error('database password=secret'))).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
    });
  });

  it('normalizes an invalid HttpException status to 500', () => {
    const error = new HttpException('', 700);
    expect(getProblemStatus(error)).toBe(500);
    expect(toProblemDetails(error).status).toBe(500);
  });
});
