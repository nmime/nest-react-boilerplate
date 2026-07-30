// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NatsConnection } from '@nats-io/nats-core';
import { NatsInjectToken } from './const';
import { NatsModule } from './nats.module';
import type { NatsConnectionFactory } from './type';

function mockConnection(overrides: Partial<NatsConnection> = {}): NatsConnection {
  return {
    isClosed: vi.fn(() => false),
    isDraining: vi.fn(() => false),
    drain: vi.fn(() => Promise.resolve(undefined)),
    close: vi.fn(() => Promise.resolve(undefined)),
    closed: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  } as unknown as NatsConnection;
}

describe('NatsModule.forRoot', () => {
  it('provides a null connection and no-ops shutdown when no servers are configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NatsModule.forRoot()],
    }).compile();

    expect(moduleRef.get(NatsInjectToken, { strict: false })).toBeNull();

    // The shutdown hook must return early (and not throw) when the connection
    // is null; closing the module triggers onApplicationShutdown.
    await expect(moduleRef.close()).resolves.toBeUndefined();
  });

  it('uses an injected client connection verbatim and drains it on shutdown', async () => {
    const drain = vi.fn(() => Promise.resolve(undefined));
    const client = mockConnection({ drain });

    const moduleRef = await Test.createTestingModule({
      imports: [NatsModule.forRoot({ client })],
    }).compile();

    expect(moduleRef.get(NatsInjectToken, { strict: false })).toBe(client);

    await moduleRef.close();

    expect(drain).toHaveBeenCalledTimes(1);
  });

  it('builds the connection through a custom connection factory', async () => {
    const created = mockConnection();
    const connectionFactory = vi.fn<NatsConnectionFactory>(() => Promise.resolve(created));

    const moduleRef = await Test.createTestingModule({
      imports: [
        NatsModule.forRoot({
          servers: ['nats://nats:4222'],
          name: 'unit',
          connectionFactory,
        }),
      ],
    }).compile();

    expect(moduleRef.get(NatsInjectToken, { strict: false })).toBe(created);
    expect(connectionFactory).toHaveBeenCalledTimes(1);
    expect(connectionFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: ['nats://nats:4222'],
        name: 'unit',
      }),
    );

    await moduleRef.close();
  });
});
