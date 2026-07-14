import { describe, expect, it, vi } from 'vitest';
import { repeat } from './repeat.util';
import { retryWithBackoff } from './retry-with-backoff.util';
import { sleep } from './sleep.util';

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    vi.useFakeTimers();
    try {
      const settled = vi.fn();
      const promise = sleep(1_000).then(settled);

      await vi.advanceTimersByTimeAsync(999);
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await promise;
      expect(settled).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('repeat', () => {
  it('invokes the action for each index in order', async () => {
    const seen: number[] = [];

    await repeat(3, (index) => {
      seen.push(index);
    });

    expect(seen).toEqual([0, 1, 2]);
  });

  it('does nothing for a count of zero', async () => {
    const action = vi.fn();

    await repeat(0, action);

    expect(action).not.toHaveBeenCalled();
  });
});

describe('retryWithBackoff', () => {
  it('returns the first successful result without retrying', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(retryWithBackoff(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries with backoff until the operation succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue('done');
    const shouldRetry = vi.fn().mockReturnValue(true);

    await expect(
      retryWithBackoff(operation, {
        retries: 5,
        initialDelayMs: 1,
        factor: 2,
        maxDelayMs: 4,
        shouldRetry,
      }),
    ).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(shouldRetry).toHaveBeenCalledTimes(2);
  });

  it('stops immediately when shouldRetry returns false', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('nope'));

    await expect(
      retryWithBackoff(operation, {
        retries: 5,
        initialDelayMs: 1,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow('nope');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting the retries', async () => {
    const operation = vi.fn().mockRejectedValue('plain-string-failure');

    await expect(retryWithBackoff(operation, { retries: 2, initialDelayMs: 1 })).rejects.toThrow(
      'plain-string-failure',
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
