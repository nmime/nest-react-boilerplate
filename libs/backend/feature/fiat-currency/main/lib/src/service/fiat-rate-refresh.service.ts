import {
  FiatCurrencyPersistence,
  type FiatRateQuoteResult,
  FiatRateSource,
  type RecordFiatRateParams,
} from '@app/backend-feature-fiat-currency-shared';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { FiatRateSourcesInjectToken } from './fiat-rate-sources.token';

export interface FiatRateRefreshFailure {
  source: string;
  reason: string;
}

export interface FiatRateRefreshSummary {
  recorded: number;
  failures: FiatRateRefreshFailure[];
}

/**
 * Pulls rates from every registered {@link FiatRateSource} and appends them to the catalogue.
 *
 * A rate provider is a third party over a network: it rate-limits, it has outages, and it returns
 * a currency it was not asked about. So one failing provider is contained rather than fatal — the
 * others still land, and the failure comes back in the summary and the log instead of vanishing.
 * A caller that needs to know can read `failures`; a scheduled job can log it and try again later.
 */
@Injectable()
export class FiatRateRefreshService {
  private readonly logger = new Logger(FiatRateRefreshService.name);

  constructor(
    private readonly persistence: FiatCurrencyPersistence,
    @Optional() @Inject(FiatRateSourcesInjectToken) private readonly sources: readonly FiatRateSource[] = [],
  ) {}

  async refresh(): Promise<FiatRateRefreshSummary> {
    if (this.sources.length === 0) {
      return { recorded: 0, failures: [] };
    }

    const currencies = await this.persistence.listCurrencies({ activeOnly: true });
    const codes = currencies.map((currency) => currency.code);

    if (codes.length === 0) {
      return { recorded: 0, failures: [] };
    }

    const failures: FiatRateRefreshFailure[] = [];
    let recorded = 0;

    for (const source of this.sources) {
      let quotes: readonly FiatRateQuoteResult[];

      try {
        quotes = await source.fetchUsdRates(codes);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        this.logger.warn(`Rate source "${source.id}" failed: ${reason}`);
        failures.push({ source: source.id, reason });
        continue;
      }

      if (quotes.length === 0) {
        continue;
      }

      const rates: RecordFiatRateParams[] = quotes.map((quote) => ({ ...quote, source: source.id }));

      recorded += (await this.persistence.recordRates(rates)).length;
    }

    return { recorded, failures };
  }
}
