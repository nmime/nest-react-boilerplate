import { randomUUID } from 'node:crypto';
import { MongoDatabaseToken } from '@app/backend-mongodb-main';
import {
  type FiatCurrency,
  type FiatCurrencyRate,
  type FiatCurrencyTranslation,
  FiatCurrencyPersistence,
  type ListFiatCurrenciesFilter,
  type ListFiatRateHistoryQuery,
  type RecordFiatRateParams,
  type UpsertFiatCurrencyParams,
  fiatRateRatio,
} from '@app/backend-feature-fiat-currency-shared';
import { type CurrencyCode, currencyMinorUnitExponent } from '@app/common-money';
import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db, Filter } from 'mongodb';
import { FiatCurrencyCollectionName, FiatCurrencyRateCollectionName } from './fiat-currency-mongo.collection';
import type {
  FiatCurrencyDocument,
  FiatCurrencyRateDocument,
  FiatCurrencyTranslationDocument,
} from './fiat-currency-mongo.types';

function toFiatCurrency(document: FiatCurrencyDocument): FiatCurrency {
  return {
    code: document._id,
    minorUnitExponent: document.minorUnitExponent,
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
 * Same port, different shape: translations live inside the currency document instead of a second
 * collection, so `listTranslations` projects them out rather than reading a join table. Nothing
 * above this class can tell the difference, which is the point of the port.
 *
 * Rate writes are two statements without a transaction. A replica set would give one, but a
 * single-node deployment cannot, and the pair is ordered so the failure mode is benign: the
 * history row is written first, so a crash in between leaves a recorded observation whose headline
 * rate is one tick stale — recoverable by replaying the newest history row. The other order would
 * leave a headline rate with no evidence behind it.
 */
@Injectable()
export class FiatCurrencyMongoPersistence extends FiatCurrencyPersistence {
  private readonly currencies: Collection<FiatCurrencyDocument>;
  private readonly rates: Collection<FiatCurrencyRateDocument>;

  constructor(@Inject(MongoDatabaseToken) database: Db) {
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

  async listTranslations(codes: readonly CurrencyCode[]): Promise<FiatCurrencyTranslation[]> {
    if (codes.length === 0) {
      return [];
    }

    const documents = await this.currencies.find({ _id: { $in: [...codes] } }).toArray();

    return documents.flatMap((document) =>
      document.translations.map((translation) => ({ code: document._id, ...translation })),
    );
  }

  async upsertCurrency(params: UpsertFiatCurrencyParams): Promise<FiatCurrency> {
    const existing = await this.currencies.findOne({ _id: params.code });
    const now = new Date();
    // Resolved once and reused for both the write and the reply, so an operator can never be told
    // one thing while the collection holds another.
    const resolved = {
      code: params.code,
      symbol: params.symbol,
      minorUnitExponent:
        params.minorUnitExponent ?? existing?.minorUnitExponent ?? currencyMinorUnitExponent(params.code),
      active: params.active ?? existing?.active ?? true,
      displayOrder: params.displayOrder ?? existing?.displayOrder ?? 0,
      // `undefined` means "leave the image alone"; an explicit null clears it.
      imageUrl: params.imageUrl === undefined ? (existing?.imageUrl ?? null) : params.imageUrl,
      usdPerUnit: existing?.usdPerUnit ?? null,
      rateAsOf: existing?.rateAsOf ?? null,
    };
    const translations =
      params.translations && params.translations.length > 0
        ? mergeTranslations(existing?.translations ?? [], params.translations)
        : undefined;

    await this.currencies.updateOne(
      { _id: params.code },
      {
        $set: {
          symbol: resolved.symbol,
          minorUnitExponent: resolved.minorUnitExponent,
          active: resolved.active,
          displayOrder: resolved.displayOrder,
          imageUrl: resolved.imageUrl,
          updatedAt: now,
          ...(translations ? { translations } : {}),
        },
        $setOnInsert: {
          usdPerUnit: null,
          rateAsOf: null,
          createdAt: now,
          ...(translations ? {} : { translations: [] }),
        },
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
    // Validate every quote before writing anything: a batch half-applied because the fourth rate
    // was malformed is worse than one that never started.
    for (const rate of rates) {
      fiatRateRatio(rate.usdPerUnit);
    }

    const recorded: FiatCurrencyRate[] = [];

    for (const rate of rates) {
      const currency = await this.currencies.findOne({ _id: rate.code });

      if (!currency) {
        throw new Error(`${rate.code} is not in the fiat catalogue: add the currency before recording a rate.`);
      }

      // The unique index on (code, asOf, source) makes a provider retry land on the same document,
      // and $setOnInsert keeps the original recordedAt so the audit trail is not rewritten.
      await this.rates.updateOne(
        { code: rate.code, asOf: rate.asOf, source: rate.source },
        {
          $setOnInsert: {
            _id: randomUUID(),
            code: rate.code,
            usdPerUnit: rate.usdPerUnit,
            asOf: rate.asOf,
            source: rate.source,
            recordedAt: new Date(),
          },
        },
        { upsert: true },
      );

      if (currency.rateAsOf === null || currency.rateAsOf < rate.asOf) {
        await this.currencies.updateOne(
          { _id: rate.code },
          { $set: { usdPerUnit: rate.usdPerUnit, rateAsOf: rate.asOf, updatedAt: new Date() } },
        );
      }

      recorded.push({ code: rate.code, usdPerUnit: rate.usdPerUnit, asOf: rate.asOf, source: rate.source });
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
    const documents = await this.rates.find(filter).sort({ asOf: -1 }).limit(query.limit).toArray();

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

  return query as Filter<FiatCurrencyDocument>;
}

/** Named locales win; every other locale on the document is left exactly as it was. */
function mergeTranslations(
  existing: readonly FiatCurrencyTranslationDocument[],
  incoming: NonNullable<UpsertFiatCurrencyParams['translations']>,
): FiatCurrencyTranslationDocument[] {
  const replaced = new Set(incoming.map((entry) => entry.locale));

  return [
    ...existing.filter((entry) => !replaced.has(entry.locale)),
    ...incoming.map((entry) => ({ locale: entry.locale, name: entry.name, symbol: entry.symbol ?? null })),
  ];
}
