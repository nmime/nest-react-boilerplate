// @requirements REQ-RUNTIME-MESSAGING-006
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NatsConnection } from '@nats-io/nats-core';
import { NatsInjectToken } from './const';
import { NatsModule } from './nats.module';
import type { NatsConnectionFactory } from './type';

const { createNatsConnectionMock } = vi.hoisted(() => ({
  createNatsConnectionMock: vi.fn<NatsConnectionFactory>(),
}));

vi.mock('./nats-client.factory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./nats-client.factory')>()),
  createNatsConnection: createNatsConnectionMock,
}));

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
  const natsEnvKeys = [
    'NATS_SERVERS',
    'NATS_NAME',
    'NATS_USER',
    'NATS_PASS',
    'NATS_TOKEN',
    'NATS_TIMEOUT_MS',
    'NATS_RECONNECT',
    'NATS_MAX_RECONNECT_ATTEMPTS',
    'NATS_RECONNECT_TIME_WAIT_MS',
    'NATS_WAIT_ON_FIRST_CONNECT',
    'NATS_PING_INTERVAL_MS',
    'NATS_DRAIN_TIMEOUT_MS',
  ] as const;
  const savedNatsEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    vi.unstubAllEnvs();
    for (const key of natsEnvKeys) {
      savedNatsEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of natsEnvKeys) {
      const value = savedNatsEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    savedNatsEnv.clear();
  });

  it('provides a null connection and no-ops shutdown when no servers are configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NatsModule.forRoot()],
    }).compile();

    expect(moduleRef.get(NatsInjectToken, { strict: false })).toBeNull();

    // The shutdown hook must return early (and not throw) when the connection
    // is null; closing the module triggers onApplicationShutdown.
    await expect(moduleRef.close()).resolves.toBeUndefined();
  });

  it('treats the documented empty NATS_SERVERS value as no configured servers', async () => {
    vi.stubEnv('NATS_SERVERS', '');

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [NatsModule.forRoot()],
      }).compile();

      expect(moduleRef.get(NatsInjectToken, { strict: false })).toBeNull();
      await expect(moduleRef.close()).resolves.toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
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

  it('uses the default connection factory when no custom factory is supplied', async () => {
    const created = mockConnection();
    createNatsConnectionMock.mockResolvedValueOnce(created);

    const moduleRef = await Test.createTestingModule({
      imports: [NatsModule.forRoot({ servers: ['nats://nats:4222'] })],
    }).compile();

    expect(moduleRef.get(NatsInjectToken, { strict: false })).toBe(created);
    expect(createNatsConnectionMock).toHaveBeenCalledTimes(1);
    expect(createNatsConnectionMock).toHaveBeenCalledWith({ servers: ['nats://nats:4222'] });

    await moduleRef.close();
  });
});
