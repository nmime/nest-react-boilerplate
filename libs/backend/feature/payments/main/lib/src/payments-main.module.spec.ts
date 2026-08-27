// @requirements REQ-PAYMENT-ORDER-001 REQ-PAYMENT-WEBHOOK-003
/* v8 ignore next -- Nest's bare class-decorator helper has one synthetic branch. */
import { Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PaymentProviderPort, PaymentProvidersInjectToken } from '@app/backend-feature-payments-shared';
import { PaymentsController } from './payments.controller';
import { PaymentsMainModule } from './payments-main.module';
import { ProviderHttpClient } from './providers';
import { PaymentsService } from './payments.service';
import { PaymentProviderResolver, PaymentProviderResolverOptionsInjectToken, ProviderHealthService } from './service';

@Module({})
class StubPersistenceModule {}

describe('PaymentsMainModule', () => {
  it('takes its persistence from the caller so the feature never names an axis', () => {
    const dynamicModule = PaymentsMainModule.forRoot({ imports: [StubPersistenceModule] });

    expect(dynamicModule.module).toBe(PaymentsMainModule);
    expect(dynamicModule.imports).toEqual([StubPersistenceModule]);
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        PaymentsService,
        expect.objectContaining({ provide: ProviderHealthService }),
        expect.objectContaining({ provide: ProviderHttpClient }),
        expect.objectContaining({ provide: PaymentProviderResolver }),
      ]),
    );
    expect(dynamicModule.exports).toEqual(
      expect.arrayContaining([PaymentsService, ProviderHealthService, ProviderHttpClient, PaymentProviderResolver]),
    );
  });

  it('collects adapters under one symbol-token Map and rejects duplicate codes', () => {
    class AlphaProvider extends PaymentProviderPort {
      readonly providerCode = 'alpha';
      createPayment = async () => ({ providerPaymentId: '1', expiresAt: null, providerStatusRaw: 'pending' });
      resolvePaymentAddress = async () => null;
      getStatus = async () => ({ status: 'pending' as const, providerStatusRaw: 'pending' });
      verifyWebhook = async () => ({ result: 'none' as const, idempotencyKey: '1', events: [] });
      refund = async () => ({ status: 'requested' as const, providerStatusRaw: 'pending' });
      closePayment = async () => ({ closed: true, providerStatusRaw: 'cancelled' });
    }
    class DuplicateAlphaProvider extends AlphaProvider {}

    const providers = PaymentsMainModule.forRoot({ providers: [AlphaProvider] }).providers ?? [];
    const registryProvider = providers.find(
      (provider) =>
        typeof provider === 'object' && 'provide' in provider && provider.provide === PaymentProvidersInjectToken,
    ) as {
      inject: unknown[];
      useFactory: (...providers: PaymentProviderPort[]) => Map<string, PaymentProviderPort>;
    };
    const alpha = new AlphaProvider();

    expect(registryProvider.inject).toEqual([AlphaProvider]);
    expect(registryProvider.useFactory(alpha)).toEqual(new Map([['alpha', alpha]]));

    const persistence = {} as never;
    const providersHealth = providers.find(
      (provider) => typeof provider === 'object' && 'provide' in provider && provider.provide === ProviderHealthService,
    ) as { inject: unknown[]; useFactory: (value: never) => ProviderHealthService };
    const http = providers.find(
      (provider) => typeof provider === 'object' && 'provide' in provider && provider.provide === ProviderHttpClient,
    ) as { inject: unknown[]; useFactory: (health: ProviderHealthService) => ProviderHttpClient };
    const resolver = providers.find(
      (provider) =>
        typeof provider === 'object' && 'provide' in provider && provider.provide === PaymentProviderResolver,
    ) as {
      inject: unknown[];
      useFactory: (
        value: never,
        health: ProviderHealthService,
        registry: Map<string, PaymentProviderPort>,
        options: { ttlMs: number },
      ) => PaymentProviderResolver;
    };
    const health = providersHealth.useFactory(persistence);
    const registry = registryProvider.useFactory(alpha);

    expect(providersHealth.inject).toEqual([expect.any(Function)]);
    expect(health).toBeInstanceOf(ProviderHealthService);
    expect(http.inject).toEqual([ProviderHealthService]);
    expect(http.useFactory(health)).toBeInstanceOf(ProviderHttpClient);
    expect(resolver.inject).toEqual([
      expect.any(Function),
      ProviderHealthService,
      PaymentProvidersInjectToken,
      PaymentProviderResolverOptionsInjectToken,
    ]);
    expect(resolver.useFactory(persistence, health, registry, { ttlMs: 25 })).toBeInstanceOf(PaymentProviderResolver);
    expect(() => registryProvider.useFactory(alpha, new DuplicateAlphaProvider())).toThrow(
      'Duplicate payment provider code: alpha',
    );
  });

  it('binds an empty registry and the default resolver options when no adapters exist', () => {
    const providers = PaymentsMainModule.forRoot({}).providers ?? [];
    const registryProvider = providers.find(
      (provider) =>
        typeof provider === 'object' && 'provide' in provider && provider.provide === PaymentProvidersInjectToken,
    ) as { inject: unknown[]; useFactory: () => Map<string, PaymentProviderPort> };
    const resolverOptions = providers.find(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === PaymentProviderResolverOptionsInjectToken,
    ) as { useValue: unknown };

    expect(registryProvider.inject).toEqual([]);
    expect(registryProvider.useFactory()).toEqual(new Map());
    expect(resolverOptions.useValue).toEqual({});
  });

  it('passes custom resolver options as a value provider', () => {
    const providers = PaymentsMainModule.forRoot({ resolver: { ttlMs: 25 } }).providers ?? [];
    const resolverOptions = providers.find(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === PaymentProviderResolverOptionsInjectToken,
    ) as { useValue: unknown };

    expect(resolverOptions.useValue).toEqual({ ttlMs: 25 });
  });

  it('keeps the HTTP surface out of a process that only needs the service', () => {
    expect(PaymentsMainModule.forRoot().controllers ?? []).toEqual([]);
    expect(PaymentsMainModule.forRoot({ exposeHttp: true }).controllers).toEqual([PaymentsController]);
  });

  it('accepts the scheduler contract the capability wiring passes', () => {
    const dynamicModule = PaymentsMainModule.forRoot({
      imports: [StubPersistenceModule],
      exposeHttp: true,
      scheduler: { enabled: true, intervalMs: 60_000 },
    });

    expect(dynamicModule.imports).toEqual([StubPersistenceModule]);
    expect(dynamicModule.controllers).toEqual([PaymentsController]);
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([PaymentsService, expect.objectContaining({ provide: ProviderHealthService })]),
    );
  });
});
