import { type DynamicModule, type ModuleMetadata, Module, type Type } from '@nestjs/common';
import {
  type PaymentProviderPort,
  type PaymentProviderRegistry,
  PaymentProvidersInjectToken,
  PaymentsPersistence,
} from '@app/backend-feature-payments-shared';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhooksController } from './payments-webhooks.controller';
import { PaymentsService } from './payments.service';
import { ProviderHttpClient } from './providers';
import {
  PaymentProviderResolver,
  PaymentProviderResolverOptionsInjectToken,
  PaymentsWebhooksService,
  ProviderHealthService,
  type PaymentProviderResolverOptions,
  PaymentWebhookMetricsService,
} from './service';

export interface PaymentsMainModuleOptions {
  /**
   * The persistence module that binds `PaymentsPersistence` — the Postgres or MongoDB one.
   *
   * Passed in rather than imported here so this module compiles without either axis present, which
   * is what lets the setup tool remove one of them without touching feature code.
   */
  imports?: NonNullable<ModuleMetadata['imports']>;
  /** Provider adapter classes, collected into the symbol-token registry. */
  providers?: readonly Type<PaymentProviderPort>[];
  /** Resolver cache policy; defaults to the design's five-second TTL. */
  resolver?: PaymentProviderResolverOptions;
  /** Expose the customer + webhook endpoints in this process. */
  exposeHttp?: boolean;
  /**
   * The reconciliation/outbox scheduler this process should run.
   *
   * Accepted at the scaffold level; the scheduler services land with reconciliation (U10).
   */
  scheduler?: { enabled: boolean; intervalMs: number };
}

@Module({})
export class PaymentsMainModule {
  static forRoot(options: PaymentsMainModuleOptions = {}): DynamicModule {
    const providerTypes = options.providers ?? [];
    return {
      module: PaymentsMainModule,
      imports: options.imports ?? [],
      controllers: options.exposeHttp === true ? [PaymentsController, PaymentsWebhooksController] : [],
      providers: [
        PaymentsService,
        PaymentWebhookMetricsService,
        {
          provide: PaymentsWebhooksService,
          useFactory: (
            persistence: PaymentsPersistence,
            resolver: PaymentProviderResolver,
            metrics: PaymentWebhookMetricsService,
          ): PaymentsWebhooksService => new PaymentsWebhooksService(persistence, resolver, metrics),
          inject: [PaymentsPersistence, PaymentProviderResolver, PaymentWebhookMetricsService],
        },
        {
          provide: ProviderHealthService,
          useFactory: (persistence: PaymentsPersistence): ProviderHealthService =>
            new ProviderHealthService(persistence),
          inject: [PaymentsPersistence],
        },
        {
          provide: ProviderHttpClient,
          useFactory: (health: ProviderHealthService): ProviderHttpClient => new ProviderHttpClient(health),
          inject: [ProviderHealthService],
        },
        {
          provide: PaymentProviderResolver,
          useFactory: (
            persistence: PaymentsPersistence,
            health: ProviderHealthService,
            registry: PaymentProviderRegistry,
            resolverOptions: PaymentProviderResolverOptions,
          ): PaymentProviderResolver => new PaymentProviderResolver(persistence, health, registry, resolverOptions),
          inject: [
            PaymentsPersistence,
            ProviderHealthService,
            PaymentProvidersInjectToken,
            PaymentProviderResolverOptionsInjectToken,
          ],
        },
        ...providerTypes,
        {
          provide: PaymentProvidersInjectToken,
          useFactory: (...providers: PaymentProviderPort[]): PaymentProviderRegistry => {
            const registry: PaymentProviderRegistry = new Map();
            for (const provider of providers) {
              if (registry.has(provider.providerCode)) {
                throw new Error(`Duplicate payment provider code: ${provider.providerCode}`);
              }
              registry.set(provider.providerCode, provider);
            }
            return registry;
          },
          inject: [...providerTypes],
        },
        {
          provide: PaymentProviderResolverOptionsInjectToken,
          useValue: options.resolver ?? {},
        },
      ],
      exports: [
        PaymentsService,
        PaymentsWebhooksService,
        PaymentWebhookMetricsService,
        ProviderHealthService,
        ProviderHttpClient,
        PaymentProviderResolver,
      ],
    };
  }
}
