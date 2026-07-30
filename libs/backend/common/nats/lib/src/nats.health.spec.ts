// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it, vi } from 'vitest';
import type { NatsConnection } from '@nats-io/nats-core';
import { NatsHealthIndicator } from './nats.health';

describe('NatsHealthIndicator non-Error failures', () => {
  it('stringifies a non-Error flush rejection into the health details', async () => {
    const connection = {
      isClosed: vi.fn(() => false),
      isDraining: vi.fn(() => false),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately non-Error to exercise the String(error) fallback branch
      flush: vi.fn(() => Promise.reject('stringly typed failure')),
      getServer: vi.fn(() => 'nats://nats:4222'),
    } as unknown as NatsConnection;

    await expect(new NatsHealthIndicator(connection).check()).resolves.toEqual({
      name: 'nats',
      status: 'error',
      details: { message: 'stringly typed failure' },
    });
  });
});
