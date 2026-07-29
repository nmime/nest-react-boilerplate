import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DefaultAuthTenantId,
  type AuthLoginAnalyticsSummary,
  type AuthLoginEventInput,
  type AuthLoginEventListInput,
  type AuthLoginEventRecord,
  type AuthLoginEventRepositoryPort,
  type AuthRepositoryError,
  type TransactionalOutboxRecord,
} from '@app/backend-feature-auth-shared';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';
import { AuthMongoCollections } from './auth-mongo.collections';
import { collection, pageLimit, pageOffset, repositoryResult, withoutId } from './auth-mongo.util';
import { toDocument } from './auth-mongo-admin.repository';

@Injectable()
export class MongoAuthLoginEventRepository implements AuthLoginEventRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  record(input: AuthLoginEventInput): ResultAsync<AuthLoginEventRecord, AuthRepositoryError> {
    return repositoryResult(runInMongoTransaction(this.client, (session) => this.persist(input, session)));
  }
  list(input: AuthLoginEventListInput = {}): ResultAsync<AuthLoginEventRecord[], AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.loginEvents)
        .find(eventFilter(input))
        .sort({ occurredAt: -1, _id: -1 })
        .skip(pageOffset(input.offset))
        .limit(pageLimit(input.limit))
        .toArray()
        .then((items) => items.map((item) => withoutId(item) as AuthLoginEventRecord)),
    );
  }
  count(input: AuthLoginEventListInput = {}): ResultAsync<number, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.loginEvents).countDocuments(eventFilter(input)),
    );
  }
  summary(input: AuthLoginEventListInput = {}): ResultAsync<AuthLoginAnalyticsSummary, AuthRepositoryError> {
    return repositoryResult(this.summarize(input));
  }
  async applyRetention(input: {
    tenantId?: string;
    anonymizeBefore: Date;
    deleteBefore: Date;
    now?: Date;
  }): Promise<{ anonymized: number; deleted: number }> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    return runInMongoTransaction(this.client, async (session) => {
      const anonymized = await collection(this.database, AuthMongoCollections.loginEvents).updateMany(
        { tenantId, occurredAt: { $lt: input.anonymizeBefore }, networkAnonymizedAt: null },
        { $set: { ipAddress: null, userAgent: null, networkAnonymizedAt: input.now ?? new Date() } },
        { session },
      );
      const deleted = await collection(this.database, AuthMongoCollections.loginEvents).deleteMany(
        { tenantId, occurredAt: { $lt: input.deleteBefore } },
        { session },
      );
      return { anonymized: anonymized.modifiedCount, deleted: deleted.deletedCount };
    });
  }
  private async persist(input: AuthLoginEventInput, session: ClientSession): Promise<AuthLoginEventRecord> {
    const event: AuthLoginEventRecord = {
      id: randomUUID(),
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      userId: input.userId ?? null,
      identifierHash: input.identifierHash ?? null,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      outcome: input.outcome,
      provider: input.provider,
      channel: input.channel,
      failureCode: input.failureCode ?? null,
      ipAddress: input.ipAddress ?? null,
      ipHash: input.ipHash ?? null,
      countryCode: input.countryCode ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      timezone: input.timezone ?? null,
      timezoneSource: input.timezoneSource ?? null,
      language: input.language ?? null,
      languageSource: input.languageSource ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      networkAnonymizedAt: input.networkAnonymizedAt ?? null,
    };
    const outbox: TransactionalOutboxRecord = {
      id: randomUUID(),
      tenantId: event.tenantId,
      aggregateType: 'auth-login-event',
      aggregateId: event.id,
      eventType: `auth.${event.eventType}.${event.outcome}`,
      payload: {
        loginEventId: event.id,
        userId: event.userId,
        provider: event.provider,
        channel: event.channel,
        outcome: event.outcome,
        countryCode: event.countryCode,
        language: event.language,
        timezone: event.timezone,
        occurredAt: event.occurredAt.toISOString(),
      },
      metadata: event.requestId ? { requestId: event.requestId } : {},
      status: 'pending',
      createdAt: new Date(),
      publishedAt: null,
    };
    await collection(this.database, AuthMongoCollections.loginEvents).insertOne(toDocument(event), { session });
    await collection(this.database, AuthMongoCollections.outbox).insertOne(toDocument(outbox), { session });
    return event;
  }
  private async summarize(input: AuthLoginEventListInput): Promise<AuthLoginAnalyticsSummary> {
    const events = await collection(this.database, AuthMongoCollections.loginEvents).find(eventFilter(input)).toArray();
    const successful = events.filter((item) => item.outcome === 'success').length;
    const dimensions = (field: string) =>
      [
        ...events.reduce(
          (map, item) =>
            map.set(String(item[field] ?? 'unknown'), (map.get(String(item[field] ?? 'unknown')) ?? 0) + 1),
          new Map<string, number>(),
        ),
      ]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, 20);
    return {
      total: events.length,
      successful,
      failed: events.filter((item) => item.outcome === 'failure').length,
      uniqueUsers: new Set(events.flatMap((item) => (typeof item.userId === 'string' ? [item.userId] : []))).size,
      successRate: events.length ? Number(((successful / events.length) * 100).toFixed(2)) : 0,
      byCountry: dimensions('countryCode'),
      byLanguage: dimensions('language'),
      byTimezone: dimensions('timezone'),
      byProvider: dimensions('provider'),
    };
  }
}
const eventFilter = (input: AuthLoginEventListInput): Record<string, unknown> => ({
  tenantId: input.tenantId ?? DefaultAuthTenantId,
  ...(input.userId ? { userId: input.userId } : {}),
  ...(input.outcome ? { outcome: input.outcome } : {}),
  ...(input.provider ? { provider: input.provider } : {}),
  ...(input.countryCode ? { countryCode: input.countryCode } : {}),
  ...(input.language ? { language: input.language } : {}),
  ...(input.timezone ? { timezone: input.timezone } : {}),
  ...(input.occurredFrom || input.occurredTo
    ? {
        occurredAt: {
          ...(input.occurredFrom ? { $gte: input.occurredFrom } : {}),
          ...(input.occurredTo ? { $lte: input.occurredTo } : {}),
        },
      }
    : {}),
});
