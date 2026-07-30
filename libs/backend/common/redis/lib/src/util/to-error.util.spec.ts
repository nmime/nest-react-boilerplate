// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it } from 'vitest';
import { toError } from './to-error.util';

describe('toError', () => {
  it('returns Error instances unchanged', () => {
    const error = new Error('boom');
    expect(toError(error)).toBe(error);
  });

  it('wraps non-Error values in an Error', () => {
    const error = toError('stringly-typed failure');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('stringly-typed failure');
  });
});
