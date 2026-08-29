import { randomUUID } from 'node:crypto';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from '@app/backend-mongodb-main';
import {
  type FiatCurrency,
  type FiatCurrencyRate,
  FiatCurrencyPersistence,
  type ListFiatCurrenciesFilter,
  type ListFiatRateHistoryQuery,
  type RecordFiatRateParams,
  type UpsertFiatCurrencyParams,
  fiatRateRatio,
  normalizeFiatRateText,
  resolveFiatMinorUnitExponent,
} from '@app/backend-feature-fiat-currency-shared';
import type { CurrencyCode } from '@app/common-money';
import { Inject, Injectable } from '@nestjs/common';
import type { ClientSession, Collection, Db, Filter, MongoClient } from 'mongodb';
import { FiatCurrencyCollectionName, FiatCurrencyRateCollectionName } from './fiat-currency-mongo.collection';
import type { FiatCurrencyDocument, FiatCurrencyRateDocument } from './fiat-currency-mongo.types';

function toFiatCurrency(document: FiatCurrencyDocument): FiatCurrency {
  return {
    code: document._id,
    minorUnitExponent: document.minorUnitExponent,
    name: document.name,
    symbol: document.symbol,
    imageUrl: document.imageUrl,
    active: document.active,
    displayOrder: document.displayOrder,
    usdPerUnit: document.usdPerUnit,
    rateAsOf: document.rateAsOf,
  };
}

function toFiatCurrencyRate(document: FiatCurrencyRateDocument): FiatCurrencyRate {
  return { code: document.code, usdPerUnit: document.usdPerUnit, asOf: document.asOf, source: document.source };
}

/**
 * The MongoDB side of {@link FiatCurrencyPersistence}.
 *
 * Same port, same shape: the localized name and symbol are locale maps on the currency document,
 * as they are jsonb columns on the other axis. Nothing above this class can tell which axis it is
 * talking to, which is the point of the port.
 *
 * Rate-history and headline writes share one MongoDB transaction, matching the PostgreSQL adapter:
 * either the complete provider batch is durable, or no observation/headline pair from it is.
 */
@Injectable()
export class FiatCurrencyMongoPersistence extends FiatCurrencyPersistence {
  private readonly currencies: Collection<FiatCurrencyDocument>;
  private readonly rates: Collection<FiatCurrencyRateDocument>;

  constructor(
    @Inject(MongoDatabaseToken) database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {
    super();
    this.currencies = database.collection<FiatCurrencyDocument>(FiatCurrencyCollectionName);
    this.rates = database.collection<FiatCurrencyRateDocument>(FiatCurrencyRateCollectionName);
  }

  async listCurrencies(filter: ListFiatCurrenciesFilter): Promise<FiatCurrency[]> {
    const documents = await this.currencies
      .find(toCurrencyFilter(filter), { sort: { displayOrder: 1, _id: 1 } })
      .toArray();

    return documents.map(toFiatCurrency);
  }

  async findCurrency(code: CurrencyCode): Promise<FiatCurrency | null> {
    const document = await this.currencies.findOne({ _id: code });

    return document ? toFiatCurrency(document) : null;
  }

  async upsertCurrency(params: UpsertFiatCurrencyParams): Promise<FiatCurrency> {
    const existing = await this.currencies.findOne({ _id: params.code });
    const now = new Date();
    // Resolved once and reused for both the write and the reply, so an operator can never be told
    // one thing while the collection holds another.
    const resolved = {
      code: params.code,
      // Whole-value $set, not a positional update into an array: the port says a write replaces the
      // map, so a locale the caller left out is a locale they deleted.
      name: params.name,
      symbol: params.symbol,
      minorUnitExponent: resolveFiatMinorUnitExponent(params.code, params.minorUnitExponent),
      active: params.active ?? existing?.active ?? true,
      displayOrder: params.displayOrder ?? existing?.displayOrder ?? 0,
      // `undefined` means "leave the image alone"; an explicit null clears it.
      imageUrl: params.imageUrl === undefined ? (existing?.imageUrl ?? null) : params.imageUrl,
      usdPerUnit: existing?.usdPerUnit ?? null,
      rateAsOf: existing?.rateAsOf ?? null,
    };

    await this.currencies.updateOne(
      { _id: params.code },
      {
        $set: {
          name: resolved.name,
          symbol: resolved.symbol,
          minorUnitExponent: resolved.minorUnitExponent,
          active: resolved.active,
          displayOrder: resolved.displayOrder,
          imageUrl: resolved.imageUrl,
          updatedAt: now,
        },
        $setOnInsert: { usdPerUnit: null, rateAsOf: null, createdAt: now },
      },
      { upsert: true },
    );

    return resolved;
  }

  async deactivateCurrency(code: CurrencyCode): Promise<boolean> {
    const result = await this.currencies.updateOne({ _id: code }, { $set: { active: false, updatedAt: new Date() } });

    return result.matchedCount > 0;
  }

  async recordRates(rates: readonly RecordFiatRateParams[]): Promise<FiatCurrencyRate[]> {
    // Validate every quote before starting the transaction.
    for (const rate of rates) {
      fiatRateRatio(rate.usdPerUnit);
    }

    return runInMongoTransaction(this.client, (session) => this.recordRatesInTransaction(rates, session));
  }

  private async recordRatesInTransaction(
    rates: readonly RecordFiatRateParams[],
    session: ClientSession,
  ): Promise<FiatCurrencyRate[]> {
    const recorded: FiatCurrencyRate[] = [];

    for (const rate of rates) {
      const normalizedRate = { ...rate, usdPerUnit: normalizeFiatRateText(rate.usdPerUnit) };
      // eslint-disable-next-line no-await-in-loop -- ordered within one transaction for deterministic batch semantics
      const currency = await this.currencies.findOne({ _id: rate.code }, { session });
      if (!currency) {
        throw new Error(`${rate.code} is not in the fiat catalogue: add the currency before recording a rate.`);
      }

      // The unique index on (code, asOf, source) makes a provider retry land on the same document,
      // and $setOnInsert keeps the original recordedAt so the audit trail is not rewritten.
      // eslint-disable-next-line no-await-in-loop -- the complete loop commits or rolls back as one unit
      const result = await this.rates.findOneAndUpdate(
        { code: rate.code, asOf: rate.asOf, source: rate.source },
        {
          $setOnInsert: {
            _id: randomUUID(),
            code: rate.code,
            usdPerUnit: normalizedRate.usdPerUnit,
            asOf: rate.asOf,
            source: rate.source,
            recordedAt: new Date(),
          },
        },
        { upsert: true, session, returnDocument: 'after', includeResultMetadata: false },
      );
      if (!result) {
        throw new Error('Fiat rate upsert did not return an observation.');
      }
      if (normalizeFiatRateText(result.usdPerUnit) !== normalizedRate.usdPerUnit) {
        throw new Error(
          `${rate.code} already has a different ${rate.source} observation at ${rate.asOf.toISOString()}.`,
        );
      }
      const observation = toFiatCurrencyRate(result);

      if (currency.rateAsOf === null || currency.rateAsOf < observation.asOf) {
        // eslint-disable-next-line no-await-in-loop -- headline and history must share the same transaction
        await this.currencies.updateOne(
          { _id: rate.code },
          { $set: { usdPerUnit: observation.usdPerUnit, rateAsOf: observation.asOf, updatedAt: new Date() } },
          { session },
        );
      }

      recorded.push(observation);
    }

    return recorded;
  }

  async listRateHistory(query: ListFiatRateHistoryQuery): Promise<FiatCurrencyRate[]> {
    const window: Record<string, Date> = {};

    if (query.since) {
      window['$gte'] = query.since;
    }
    if (query.until) {
      window['$lt'] = query.until;
    }

    const filter = (
      Object.keys(window).length > 0 ? { code: query.code, asOf: window } : { code: query.code }
    ) as Filter<FiatCurrencyRateDocument>;
    const documents = await this.rates.find(filter).sort({ asOf: -1, source: 1 }).limit(query.limit).toArray();

    return documents.map(toFiatCurrencyRate);
  }
}

function toCurrencyFilter(filter: ListFiatCurrenciesFilter): Filter<FiatCurrencyDocument> {
  const query: Record<string, unknown> = {};

  if (filter.activeOnly === true) {
    query['active'] = true;
  }
  if (filter.codes) {
    query['_id'] = { $in: [...filter.codes] };
  }

  return query;
}
