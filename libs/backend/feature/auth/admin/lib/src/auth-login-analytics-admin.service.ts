import { Inject, Injectable } from '@nestjs/common';
import {
  AuthLoginEventRepositoryInjectToken,
  type AuthLoginEventRepositoryPort,
  type AuthLoginAnalyticsSummary,
  type AuthLoginEventRecord,
  type AuthLoginEventListInput,
} from '@app/backend-feature-auth-shared';
import type {
  AuthLoginAnalyticsEventDto,
  AuthLoginAnalyticsListPayloadDto,
  AuthLoginAnalyticsQueryDto,
  AuthLoginAnalyticsSummaryDto,
} from './auth-login-analytics-admin.dto';

export class AuthLoginAnalyticsAdminPersistenceError extends Error {
  constructor(message = 'Auth login analytics persistence failed.') {
    super(message);
    this.name = 'AuthLoginAnalyticsAdminPersistenceError';
  }
}

@Injectable()
export class AuthLoginAnalyticsAdminService {
  constructor(@Inject(AuthLoginEventRepositoryInjectToken) private readonly events: AuthLoginEventRepositoryPort) {}

  async list(tenantId: string, query: AuthLoginAnalyticsQueryDto): Promise<AuthLoginAnalyticsListPayloadDto> {
    const filter = toFilter(tenantId, query);
    const [events, total] = await Promise.all([this.events.list(filter), this.events.count(filter)]);
    if (events.isErr()) {
      throw new AuthLoginAnalyticsAdminPersistenceError(events.error.message);
    }
    if (total.isErr()) {
      throw new AuthLoginAnalyticsAdminPersistenceError(total.error.message);
    }
    return {
      items: events.value.map(toView),
      total: total.value,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    };
  }

  async summary(tenantId: string, query: AuthLoginAnalyticsQueryDto): Promise<AuthLoginAnalyticsSummaryDto> {
    const result = await this.events.summary(toFilter(tenantId, query));
    if (result.isErr()) {
      throw new AuthLoginAnalyticsAdminPersistenceError(result.error.message);
    }
    return toSummaryView(result.value);
  }
}

const toFilter = (tenantId: string, query: AuthLoginAnalyticsQueryDto): AuthLoginEventListInput => ({
  tenantId,
  userId: query.userId,
  outcome: query.outcome,
  provider: query.provider,
  countryCode: query.countryCode,
  language: query.language,
  timezone: query.timezone,
  occurredFrom: query.occurredFrom ? new Date(query.occurredFrom) : undefined,
  occurredTo: query.occurredTo ? new Date(query.occurredTo) : undefined,
  limit: query.limit ?? 50,
  offset: query.offset ?? 0,
});

const toView = (event: AuthLoginEventRecord): AuthLoginAnalyticsEventDto => ({
  id: event.id,
  tenantId: event.tenantId,
  ...(event.userId ? { userId: event.userId } : {}),
  eventType: event.eventType,
  outcome: event.outcome,
  provider: event.provider,
  channel: event.channel,
  ...(event.failureCode ? { failureCode: event.failureCode } : {}),
  ...(event.ipAddress ? { ipAddress: event.ipAddress } : {}),
  ...(event.countryCode ? { countryCode: event.countryCode } : {}),
  ...(event.region ? { region: event.region } : {}),
  ...(event.city ? { city: event.city } : {}),
  ...(event.timezone ? { timezone: event.timezone } : {}),
  ...(event.timezoneSource ? { timezoneSource: event.timezoneSource } : {}),
  ...(event.language ? { language: event.language } : {}),
  ...(event.languageSource ? { languageSource: event.languageSource } : {}),
  ...(event.userAgent ? { userAgent: event.userAgent } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
  networkAnonymized: event.networkAnonymizedAt !== null,
  occurredAt: event.occurredAt.toISOString(),
});

const toSummaryView = (summary: AuthLoginAnalyticsSummary): AuthLoginAnalyticsSummaryDto => ({ ...summary });
