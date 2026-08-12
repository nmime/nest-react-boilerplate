import type { FiatRateSource } from '@app/backend-feature-fiat-currency-shared';
import { type DynamicModule, Module, type ModuleMetadata, type Type } from '@nestjs/common';
import { FiatCurrencyController } from './controller';
import { FiatCurrencyService, FiatRateRefreshService, FiatRateSourcesInjectToken } from './service';

export interface FiatCurrencyMainModuleOptions {
  /**
   * The persistence module that binds `FiatCurrencyPersistence` — the Postgres or MongoDB one.
   *
   * Passed in rather than imported here so this module compiles without either axis present, which
   * is what lets the setup tool remove one of them without touching feature code.
   */
  imports?: NonNullable<ModuleMetadata['imports']>;
  /** Expose the read-only catalogue endpoints in this process. */
  exposeHttp?: boolean;
  /** Rate providers to register. Each is provided in its own right and collected for refreshes. */
  rateSources?: readonly Type<FiatRateSource>[];
}

@Module({})
export class FiatCurrencyMainModule {
  static forRoot(options: FiatCurrencyMainModuleOptions = {}): DynamicModule {
    const rateSources = options.rateSources ?? [];

    return {
      module: FiatCurrencyMainModule,
      imports: options.imports ?? [],
      controllers: options.exposeHttp === true ? [FiatCurrencyController] : [],
      providers: [
        FiatCurrencyService,
        FiatRateRefreshService,
        ...rateSources,
        // Always registered, even when empty: the refresh service can then depend on the token
        // unconditionally, and a product that adds its first provider changes one option instead of
        // discovering that the token was never bound.
        {
          provide: FiatRateSourcesInjectToken,
          useFactory: (...sources: FiatRateSource[]): readonly FiatRateSource[] => sources,
          inject: [...rateSources],
        },
      ],
      exports: [FiatCurrencyService, FiatRateRefreshService],
    };
  }
}
