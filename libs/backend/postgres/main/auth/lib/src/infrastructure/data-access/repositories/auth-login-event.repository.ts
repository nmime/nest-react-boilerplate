import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import {
  AuthLoginEventEntity,
  DefaultAuthTenantId,
  TransactionalOutboxEventEntity,
  type AuthLoginEventEntityInput,
  type AuthLoginOutcome,
} from '../entities';
import type { AuthUserRepositoryError } from './auth-user.repository';
import { normalizePageLimit, normalizePageOffset } from './admin-user-mutation.repository';

export interface AuthLoginEventListInput {
  tenantId?: string;
  userId?: string;
  outcome?: AuthLoginOutcome;
  provider?: string;
  countryCode?: string;
  language?: string;
  timezone?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
  offset?: number;
}

export interface AuthLoginAnalyticsDimension {
  key: string;
  count: number;
}

export interface AuthLoginAnalyticsSummary {
  total: number;
  successful: number;
  failed: number;
  uniqueUsers: number;
  successRate: number;
  byCountry: AuthLoginAnalyticsDimension[];
  byLanguage: AuthLoginAnalyticsDimension[];
  byTimezone: AuthLoginAnalyticsDimension[];
  byProvider: AuthLoginAnalyticsDimension[];
}

interface AggregateRow {
  total: string | number;
  successful: string | number;
  failed: string | number;
  uniqueUsers: string | number;
}

interface DimensionRow {
  key: string | null;
  count: string | number;
}

@Injectable()
export class AuthLoginEventRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  record(input: AuthLoginEventEntityInput): ResultAsync<AuthLoginEventEntity, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.persistWithOutbox(input), mapRepositoryError);
  }

  list(input: AuthLoginEventListInput = {}): ResultAsync<AuthLoginEventEntity[], AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(AuthLoginEventEntity, toEntityFilter(input), {
        limit: normalizePageLimit(input.limit),
        offset: normalizePageOffset(input.offset),
        orderBy: { occurredAt: 'DESC', id: 'DESC' },
      }),
      mapRepositoryError,
    );
  }

  count(input: AuthLoginEventListInput = {}): ResultAsync<number, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.count(AuthLoginEventEntity, toEntityFilter(input)),
      mapRepositoryError,
    );
  }

  summary(input: AuthLoginEventListInput = {}): ResultAsync<AuthLoginAnalyticsSummary, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.querySummary(input), mapRepositoryError);
  }

  async applyRetention(input: {
    tenantId?: string;
    anonymizeBefore: Date;
    deleteBefore: Date;
    now?: Date;
  }): Promise<{ anonymized: number; deleted: number }> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const now = input.now ?? new Date();
    return this.entityManager.transactional(async (em) => {
      const anonymized = await em.nativeUpdate(
        AuthLoginEventEntity,
        {
          tenantId,
          occurredAt: { $lt: input.anonymizeBefore },
          networkAnonymizedAt: null,
        },
        {
          ipAddress: null,
          userAgent: null,
          networkAnonymizedAt: now,
        },
      );
      const deleted = await em.nativeDelete(AuthLoginEventEntity, {
        tenantId,
        occurredAt: { $lt: input.deleteBefore },
      });
      return { anonymized, deleted };
    });
  }

  private async persistWithOutbox(input: AuthLoginEventEntityInput): Promise<AuthLoginEventEntity> {
    return this.entityManager.transactional(async (em) => {
      const event = new AuthLoginEventEntity(input);
      em.persist(event);
      em.persist(
        new TransactionalOutboxEventEntity({
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
        }),
      );
      await em.flush();
      return event;
    });
  }

  private async querySummary(input: AuthLoginEventListInput): Promise<AuthLoginAnalyticsSummary> {
    const { sql, params } = toSqlFilter(input);
    const [aggregateRows, byCountryRows, byLanguageRows, byTimezoneRows, byProviderRows] = await Promise.all([
      this.queryAggregate(
        `select count(*) as "total",
                count(*) filter (where outcome = 'success') as "successful",
                count(*) filter (where outcome = 'failure') as "failed",
                count(distinct user_id) filter (where user_id is not null) as "uniqueUsers"
           from auth_login_events where ${sql}`,
        params,
      ),
      this.queryDimension('country_code', sql, params),
      this.queryDimension('language', sql, params),
      this.queryDimension('timezone', sql, params),
      this.queryDimension('provider', sql, params),
    ]);
    const aggregate = aggregateRows[0] ?? { total: 0, successful: 0, failed: 0, uniqueUsers: 0 };
    const total = toNumber(aggregate.total);
    const successful = toNumber(aggregate.successful);
    return {
      total,
      successful,
      failed: toNumber(aggregate.failed),
      uniqueUsers: toNumber(aggregate.uniqueUsers),
      successRate: total === 0 ? 0 : Number(((successful / total) * 100).toFixed(2)),
      byCountry: mapDimensions(byCountryRows),
      byLanguage: mapDimensions(byLanguageRows),
      byTimezone: mapDimensions(byTimezoneRows),
      byProvider: mapDimensions(byProviderRows),
    };
  }

  private async queryAggregate(sql: string, params: unknown[]): Promise<AggregateRow[]> {
    const rows: unknown = await this.entityManager.getConnection().execute(sql, params);
    return toAggregateRows(rows);
  }

  private async queryDimension(
    column: 'country_code' | 'language' | 'timezone' | 'provider',
    sql: string,
    params: unknown[],
  ): Promise<DimensionRow[]> {
    const rows: unknown = await this.entityManager.getConnection().execute(
      `select coalesce(${column}, 'unknown') as "key", count(*) as "count"
         from auth_login_events where ${sql}
        group by coalesce(${column}, 'unknown')
        order by count(*) desc, coalesce(${column}, 'unknown') asc
        limit 20`,
      params,
    );
    return toDimensionRows(rows);
  }
}

const toEntityFilter = (input: AuthLoginEventListInput): Record<string, unknown> => ({
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

function toSqlFilter(input: AuthLoginEventListInput): { sql: string; params: unknown[] } {
  const clauses = ['tenant_id = ?'];
  const params: unknown[] = [input.tenantId ?? DefaultAuthTenantId];
  const add = (clause: string, value: unknown) => {
    clauses.push(clause);
    params.push(value);
  };
  if (input.userId) {
    add('user_id = ?', input.userId);
  }
  if (input.outcome) {
    add('outcome = ?', input.outcome);
  }
  if (input.provider) {
    add('provider = ?', input.provider);
  }
  if (input.countryCode) {
    add('country_code = ?', input.countryCode);
  }
  if (input.language) {
    add('language = ?', input.language);
  }
  if (input.timezone) {
    add('timezone = ?', input.timezone);
  }
  if (input.occurredFrom) {
    add('occurred_at >= ?', input.occurredFrom);
  }
  if (input.occurredTo) {
    add('occurred_at <= ?', input.occurredTo);
  }
  return { sql: clauses.join(' and '), params };
}

const toNumber = (value: string | number): number => Number(value) || 0;
const toDatabaseNumber = (value: unknown): string | number =>
  typeof value === 'string' || typeof value === 'number' ? value : 0;
const toAggregateRows = (value: unknown): AggregateRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((row: unknown) =>
    isRecord(row)
      ? [
          {
            total: toDatabaseNumber(row.total),
            successful: toDatabaseNumber(row.successful),
            failed: toDatabaseNumber(row.failed),
            uniqueUsers: toDatabaseNumber(row.uniqueUsers),
          },
        ]
      : [],
  );
};
const toDimensionRows = (value: unknown): DimensionRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((row: unknown) => {
    if (!isRecord(row)) {
      return [];
    }
    return [
      {
        key: typeof row.key === 'string' ? row.key : null,
        count: toDatabaseNumber(row.count),
      },
    ];
  });
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const mapDimensions = (rows: DimensionRow[]): AuthLoginAnalyticsDimension[] =>
  rows.map((row) => ({ key: row.key ?? 'unknown', count: toNumber(row.count) }));

function mapRepositoryError(cause: unknown): AuthUserRepositoryError {
  return {
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Auth login analytics repository failed.',
  };
}
