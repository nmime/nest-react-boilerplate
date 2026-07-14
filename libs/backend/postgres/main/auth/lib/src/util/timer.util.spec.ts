import { describe, expect, it, vi } from 'vitest';
import type { CleanupInterval } from '../type/auth-token-cleanup-internal.type';
import { unrefTimer } from './timer.util';

function asTimer(value: unknown): CleanupInterval {
  return value as CleanupInterval;
}

describe('unrefTimer', () => {
  it('calls unref on object timers that expose it', () => {
    const unref = vi.fn();
    unrefTimer(asTimer({ unref }));

    expect(unref).toHaveBeenCalledTimes(1);
  });

  it('ignores numeric timer handles that are not objects', () => {
    expect(() => {
      unrefTimer(asTimer(7));
    }).not.toThrow();
  });

  it('ignores object timers without an unref method', () => {
    expect(() => {
      unrefTimer(asTimer({}));
    }).not.toThrow();
  });

  it('ignores object timers whose unref is not a function', () => {
    expect(() => {
      unrefTimer(asTimer({ unref: 'nope' }));
    }).not.toThrow();
  });
});
