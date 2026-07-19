import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createProblemDetails } from './create-problem-details.util';

describe('createProblemDetails (RFC 9457)', () => {
  it('creates problem details with required static fields', () => {
    expect(
      createProblemDetails({
        title: 'Forbidden',
        detail: 'Missing role',
        status: 403,
        instance: 'https://errors.example.test/problem-instances/admin-profile-me',
        type: 'https://errors.example.test/problems/forbidden',
      }),
    ).toEqual({
      type: 'https://errors.example.test/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Missing role',
      instance: 'https://errors.example.test/problem-instances/admin-profile-me',
    });
  });

  it('defaults type to about:blank when no code provided', () => {
    expect(createProblemDetails({ title: 'Bad', detail: 'Bad request', status: 400 })).toEqual({
      type: 'about:blank',
      title: 'Bad',
      detail: 'Bad request',
      status: 400,
    });
  });

  it('defaults type to the product-owned HTTPS namespace when code is provided', () => {
    expect(
      createProblemDetails({
        title: 'Conflict',
        detail: 'Resource conflict',
        status: 409,
        code: 'conflict',
      }),
    ).toEqual({
      type: 'https://example.com/problems/conflict',
      title: 'Conflict',
      status: 409,
      detail: 'Resource conflict',
      code: 'conflict',
    });
  });

  it('omits raw request paths from problem instance', () => {
    expect(
      createProblemDetails({
        title: 'Not Found',
        detail: 'Resource not found',
        status: HttpStatus.NOT_FOUND,
        instance: '/',
      }),
    ).not.toHaveProperty('instance');

    expect(
      createProblemDetails({
        title: 'Not Found',
        detail: 'Resource not found',
        status: HttpStatus.NOT_FOUND,
        instance: '/missing',
      }),
    ).not.toHaveProperty('instance');
  });

  it('keeps non-path instances', () => {
    expect(
      createProblemDetails({
        title: 'Conflict',
        detail: 'Conflict occurred',
        status: 409,
        instance: 'https://errors.example.test/problem-instances/canonical',
      }),
    ).toHaveProperty('instance', 'https://errors.example.test/problem-instances/canonical');
  });

  it('detail is always present in output', () => {
    const result = createProblemDetails({
      title: 'Test',
      detail: 'Test detail',
      status: 400,
    });
    expect(result.detail).toBe('Test detail');
  });
});
