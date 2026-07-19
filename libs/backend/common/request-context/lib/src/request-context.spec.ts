import { describe, expect, it } from 'vitest';
import { normalizeRequestId, requestContext } from './request-context';

describe('requestContext', () => {
  it('provides one request id and scoped values through async work', async () => {
    await requestContext.run(async () => {
      const requestId = requestContext.getRequestId();
      requestContext.set('actorId', 'actor-1');
      await Promise.resolve();

      expect(requestId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(requestContext.getRequestId()).toBe(requestId);
      expect(requestContext.get('actorId')).toBe('actor-1');
      expect(requestContext.isAvailable()).toBe(true);
    });

    expect(requestContext.isAvailable()).toBe(false);
  });

  it('preserves a caller-provided request id', () => {
    requestContext.run(() => {
      expect(requestContext.getRequestId()).toBe('request-123');
    }, 'request-123');
  });

  it('normalizes scalar and array request-id headers', () => {
    expect(normalizeRequestId(['  first  ', 'second'])).toBe('first');
    expect(normalizeRequestId('a'.repeat(128))).toHaveLength(128);
    expect(normalizeRequestId('a'.repeat(129))).toBeUndefined();
    expect(normalizeRequestId('invalid request id')).toBeUndefined();
    expect(normalizeRequestId('request\nsmuggled-header')).toBeUndefined();
    expect(normalizeRequestId('   ')).toBeUndefined();
  });
});
