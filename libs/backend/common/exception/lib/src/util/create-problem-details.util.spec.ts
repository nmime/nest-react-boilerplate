import { describe, expect, it } from 'vitest';
import { createProblemDetails } from './create-problem-details.util';

describe('createProblemDetails', () => {
  it('creates the strict emitted profile and preserves absolute or relative URI references', () => {
    expect(
      createProblemDetails({
        title: 'Forbidden',
        detail: 'Missing role',
        status: 403,
        instance: '/problem-instances/request-1',
        type: 'https://errors.example.test/problems#forbidden',
        extensions: { code: 'forbidden-example' },
      }),
    ).toEqual({
      type: 'https://errors.example.test/problems#forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Missing role',
      instance: '/problem-instances/request-1',
      code: 'forbidden-example',
    });
  });

  it('defaults the type to about:blank and permits detail to be absent', () => {
    expect(createProblemDetails({ title: 'Bad Request', status: 400 })).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
    });
  });

  it('rejects malformed standard members and extension collisions', () => {
    expect(() => createProblemDetails({ title: '', status: 400 })).toThrow(TypeError);
    expect(() => createProblemDetails({ title: 'Bad', status: 99 })).toThrow(RangeError);
    expect(() => createProblemDetails({ title: 'Bad', status: 400, type: 'not a uri' })).toThrow(TypeError);
    expect(() => createProblemDetails({ title: 'Bad', status: 400, extensions: { status: 500 } })).toThrow(TypeError);
    expect(() => createProblemDetails({ title: 'Bad', status: 400, extensions: { 'bad-name': true } })).toThrow(
      TypeError,
    );
  });
});
