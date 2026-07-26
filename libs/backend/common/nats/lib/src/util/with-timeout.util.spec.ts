// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './with-timeout.util';

describe('withTimeout', () => {
  it('returns the original promise verbatim when no timeout is configured', () => {
    const promise = Promise.resolve('value');

    expect(withTimeout(promise, undefined)).toBe(promise);
    expect(withTimeout(promise, 0)).toBe(promise);
  });

  it('resolves with the settled value when it arrives before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('rejects with the original Error when the promise rejects before the timeout', async () => {
    const error = new Error('drain failed');

    await expect(withTimeout(Promise.reject(error), 1000)).rejects.toBe(error);
  });

  it('wraps a non-Error rejection in an Error before the timeout', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately non-Error to exercise the new Error(String(error)) branch
      withTimeout(Promise.reject('stringly typed'), 1000),
    ).rejects.toThrow('stringly typed');
  });

  it('rejects with a timeout error when the promise never settles', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<void>(() => undefined);
      const guarded = withTimeout(pending, 250);
      const assertion = expect(guarded).rejects.toThrow('NATS drain timed out after 250ms.');

      await vi.advanceTimersByTimeAsync(250);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
