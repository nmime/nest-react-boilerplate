import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import type { CurrencyCode } from '@app/common-money';
import {
  type FiatCurrency,
  type FiatCurrencyRate,
  FiatCurrencyPersistence,
  type ListFiatCurrenciesFilter,
  type ListFiatRateHistoryQuery,
  type RecordFiatRateParams,
  type UpsertFiatCurrencyParams,
  fiatRateRatio,
} from '@app/backend-feature-fiat-currency-shared';
import { FiatCurrencyEntity, FiatCurrencyRateEntity } from '../entities';

function toFiatCurrency(entity: FiatCurrencyEntity): FiatCurrency {
  return {
    code: entity.code,
    minorUnitExponent: entity.minorUnitExponent,
    name: entity.name,
    symbol: entity.symbol,
    imageUrl: entity.imageUrl,
    active: entity.active,
    displayOrder: entity.displayOrder,
    usdPerUnit: entity.usdPerUnit,
    rateAsOf: entity.rateAsOf,
  };
}

function toFiatCurrencyRate(entity: FiatCurrencyRateEntity): FiatCurrencyRate {
  return { code: entity.code, usdPerUnit: entity.usdPerUnit, asOf: entity.asOf, source: entity.source };
}

/**
 * The Postgres side of {@link FiatCurrencyPersistence}.
 *
 * Everything that writes a rate runs inside one transaction, because appending to the history and
 * advancing the currency's current rate are two statements describing one fact. Split across
 * transactions, a crash between them leaves a catalogue whose headline rate has no matching
 * history row — which is exactly the row an auditor asks for.
 */
@Injectable()
export class FiatCurrencyPostgresPersistence extends FiatCurrencyPersistence {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {
    super();
  }

  async listCurrencies(filter: ListFiatCurrenciesFilter): Promise<FiatCurrency[]> {
    const where: Record<string, unknown> = {};

    if (filter.activeOnly === true) {
      where['active'] = true;
    }
    if (filter.codes) {
      where['code'] = { $in: [...filter.codes] };
    }

    const rows = await this.entityManager.find(FiatCurrencyEntity, where, {
      orderBy: { displayOrder: 'ASC', code: 'ASC' },
    });

    return rows.map(toFiatCurrency);
  }

  async findCurrency(code: CurrencyCode): Promise<FiatCurrency | null> {
    const row = await this.entityManager.findOne(FiatCurrencyEntity, { code });

    return row ? toFiatCurrency(row) : null;
  }

  async upsertCurrency(params: UpsertFiatCurrencyParams): Promise<FiatCurrency> {
    const existing = await this.entityManager.findOne(FiatCurrencyEntity, { code: params.code });
    const currency = existing ?? new FiatCurrencyEntity(params);

    // Assigned rather than merged: the names are one column now, and the port says a write replaces
    // the whole map. A currency and its names are a single row, so this needs no transaction.
    currency.name = params.name;
    currency.symbol = params.symbol;
    currency.minorUnitExponent = params.minorUnitExponent ?? currency.minorUnitExponent;
    currency.imageUrl = params.imageUrl === undefined ? currency.imageUrl : params.imageUrl;
    currency.active = params.active ?? currency.active;
    currency.displayOrder = params.displayOrder ?? currency.displayOrder;

    if (!existing) {
      this.entityManager.persist(currency);
    }

    await this.entityManager.flush();

    return toFiatCurrency(currency);
  }

  async deactivateCurrency(code: CurrencyCode): Promise<boolean> {
    const currency = await this.entityManager.findOne(FiatCurrencyEntity, { code });

    if (!currency) {
      return false;
    }

    currency.active = false;
    await this.entityManager.flush();

    return true;
  }

  async recordRates(rates: readonly RecordFiatRateParams[]): Promise<FiatCurrencyRate[]> {
    // Validate every quote before opening the transaction: a batch that is half-written because
    // the fourth rate was malformed is worse than one that was never started.
    for (const rate of rates) {
      fiatRateRatio(rate.usdPerUnit);
    }

    return this.entityManager.transactional(async (manager) => {
      const recorded: FiatCurrencyRate[] = [];

      for (const rate of rates) {
        const currency = await manager.findOne(FiatCurrencyEntity, { code: rate.code });

        if (!currency) {
          throw new Error(`${rate.code} is not in the fiat catalogue: add the currency before recording a rate.`);
        }

        const duplicate = await manager.findOne(FiatCurrencyRateEntity, {
          code: rate.code,
          asOf: rate.asOf,
          source: rate.source,
        });

        if (!duplicate) {
          manager.persist(new FiatCurrencyRateEntity(rate));
        }

        // A provider that backfills yesterday is reporting history, not news. Only a strictly
        // newer observation moves the headline rate.
        if (currency.rateAsOf === null || currency.rateAsOf < rate.asOf) {
          currency.usdPerUnit = rate.usdPerUnit;
          currency.rateAsOf = rate.asOf;
        }

        recorded.push({ code: rate.code, usdPerUnit: rate.usdPerUnit, asOf: rate.asOf, source: rate.source });
      }

      await manager.flush();

      return recorded;
    });
  }

  async listRateHistory(query: ListFiatRateHistoryQuery): Promise<FiatCurrencyRate[]> {
    const window: Record<string, Date> = {};

    if (query.since) {
      window['$gte'] = query.since;
    }
    if (query.until) {
      window['$lt'] = query.until;
    }

    const where = Object.keys(window).length > 0 ? { code: query.code, asOf: window } : { code: query.code };
    const rows = await this.entityManager.find(FiatCurrencyRateEntity, where, {
      orderBy: { asOf: 'DESC' },
      limit: query.limit,
    });

    return rows.map(toFiatCurrencyRate);
  }
}
