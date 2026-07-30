// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it, vi } from 'vitest';
import type { NatsConnection } from '@nats-io/nats-core';
import { closeNatsConnection } from './nats-client.factory';

function mockConnection(overrides: Partial<NatsConnection>): NatsConnection {
  return {
    isClosed: vi.fn(() => false),
    isDraining: vi.fn(() => false),
    drain: vi.fn(() => Promise.resolve(undefined)),
    close: vi.fn(() => Promise.resolve(undefined)),
    closed: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  } as unknown as NatsConnection;
}

describe('closeNatsConnection failure handling', () => {
  it('does not force-close when the connection is already closed after a failed drain', async () => {
    // First isClosed() (top guard) is false so we proceed; the second call
    // (inside the catch) reports closed so the force-close is skipped.
    const isClosed = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const drain = vi.fn(() => Promise.reject(new Error('drain failed')));
    const close = vi.fn(() => Promise.resolve(undefined));
    const connection = mockConnection({ isClosed, drain, close });

    await expect(closeNatsConnection(connection)).resolves.toBeUndefined();

    expect(drain).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('swallows a rejected force-close after a failed drain', async () => {
    const drain = vi.fn(() => Promise.reject(new Error('drain failed')));
    const close = vi.fn(() => Promise.reject(new Error('close failed')));
    const connection = mockConnection({
      isClosed: vi.fn(() => false),
      drain,
      close,
    });

    await expect(closeNatsConnection(connection)).resolves.toBeUndefined();

    expect(drain).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
