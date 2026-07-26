// @requirements REQ-RUNTIME-MESSAGING-006
import { Injectable } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  NatsInjectToken,
  NatsJetStreamInjectToken,
  NatsJetStreamManagerInjectToken,
  NatsKvManagerInjectToken,
  NatsObjectStoreManagerInjectToken,
  NatsServiceManagerInjectToken,
} from '../const';
import {
  InjectNatsConnection,
  InjectNatsJetStream,
  InjectNatsJetStreamManager,
  InjectNatsKvManager,
  InjectNatsObjectStoreManager,
  InjectNatsServiceManager,
} from './inject-nats.decorator';

@Injectable()
class DecoratorProbe {
  constructor(
    @InjectNatsConnection() readonly connection: unknown,
    @InjectNatsJetStream() readonly jetStream: unknown,
    @InjectNatsJetStreamManager() readonly jetStreamManager: unknown,
    @InjectNatsKvManager() readonly kvManager: unknown,
    @InjectNatsObjectStoreManager() readonly objectStoreManager: unknown,
    @InjectNatsServiceManager() readonly serviceManager: unknown,
  ) {}
}

describe('NATS inject decorators', () => {
  it('wire each provider token to its decorated constructor parameter', async () => {
    const values = {
      connection: Symbol('connection'),
      jetStream: Symbol('jetStream'),
      jetStreamManager: Symbol('jetStreamManager'),
      kvManager: Symbol('kvManager'),
      objectStoreManager: Symbol('objectStoreManager'),
      serviceManager: Symbol('serviceManager'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DecoratorProbe,
        { provide: NatsInjectToken, useValue: values.connection },
        { provide: NatsJetStreamInjectToken, useValue: values.jetStream },
        {
          provide: NatsJetStreamManagerInjectToken,
          useValue: values.jetStreamManager,
        },
        { provide: NatsKvManagerInjectToken, useValue: values.kvManager },
        {
          provide: NatsObjectStoreManagerInjectToken,
          useValue: values.objectStoreManager,
        },
        {
          provide: NatsServiceManagerInjectToken,
          useValue: values.serviceManager,
        },
      ],
    }).compile();

    const probe = moduleRef.get(DecoratorProbe);

    expect(probe.connection).toBe(values.connection);
    expect(probe.jetStream).toBe(values.jetStream);
    expect(probe.jetStreamManager).toBe(values.jetStreamManager);
    expect(probe.kvManager).toBe(values.kvManager);
    expect(probe.objectStoreManager).toBe(values.objectStoreManager);
    expect(probe.serviceManager).toBe(values.serviceManager);

    await moduleRef.close();
  });
});
