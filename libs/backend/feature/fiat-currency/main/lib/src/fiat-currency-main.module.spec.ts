// @requirements REQ-FIAT-CATALOG-001
import { FiatRateSource } from '@app/backend-feature-fiat-currency-shared';
import { Module } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FiatCurrencyController } from './controller';
import { FiatCurrencyMainModule } from './fiat-currency-main.module';
import { FiatCurrencyService, FiatRateRefreshService, FiatRateSourcesInjectToken } from './service';

@Module({})
class StubPersistenceModule {}

describe('FiatCurrencyMainModule', () => {
  it('takes its persistence from the caller so the feature never names an axis', () => {
    const dynamicModule = FiatCurrencyMainModule.forRoot({ imports: [StubPersistenceModule] });

    expect(dynamicModule.module).toBe(FiatCurrencyMainModule);
    expect(dynamicModule.imports).toEqual([StubPersistenceModule]);
    expect(dynamicModule.providers).toEqual(expect.arrayContaining([FiatCurrencyService, FiatRateRefreshService]));
    expect(dynamicModule.exports).toEqual(expect.arrayContaining([FiatCurrencyService, FiatRateRefreshService]));
  });

  it('keeps the HTTP surface out of a process that only needs the service', () => {
    expect(FiatCurrencyMainModule.forRoot({}).controllers ?? []).toEqual([]);
    expect(FiatCurrencyMainModule.forRoot({ exposeHttp: true }).controllers).toEqual([FiatCurrencyController]);
  });

  it('collects the rate providers a product registers under one multi-provider token', () => {
    class EcbRateSource extends FiatRateSource {
      readonly id = 'ecb';
      fetchUsdRates = () => Promise.resolve([]);
    }

    const dynamicModule = FiatCurrencyMainModule.forRoot({ rateSources: [EcbRateSource] });

    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        EcbRateSource,
        expect.objectContaining({ provide: FiatRateSourcesInjectToken, inject: [EcbRateSource] }),
      ]),
    );
  });

  it('binds the rate-source token to an empty list rather than leaving it unbound', () => {
    const providers = FiatCurrencyMainModule.forRoot({}).providers ?? [];
    const factoryProvider = providers.find(
      (provider) =>
        typeof provider === 'object' && 'provide' in provider && provider.provide === FiatRateSourcesInjectToken,
    ) as { useFactory: () => readonly FiatRateSource[]; inject: unknown[] } | undefined;

    expect(factoryProvider?.inject).toEqual([]);
    expect(factoryProvider?.useFactory()).toEqual([]);
  });

  it('resolves the registered sources into the array the refresh service consumes', () => {
    class EcbRateSource extends FiatRateSource {
      readonly id = 'ecb';
      fetchUsdRates = () => Promise.resolve([]);
    }

    const providers = FiatCurrencyMainModule.forRoot({ rateSources: [EcbRateSource] }).providers ?? [];
    const factoryProvider = providers.find(
      (provider) =>
        typeof provider === 'object' && 'provide' in provider && provider.provide === FiatRateSourcesInjectToken,
    ) as { useFactory: (...sources: FiatRateSource[]) => readonly FiatRateSource[] };
    const source = new EcbRateSource();

    expect(factoryProvider.useFactory(source)).toEqual([source]);
  });
});
