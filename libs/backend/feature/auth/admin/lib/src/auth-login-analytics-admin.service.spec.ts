// @requirements REQ-AUTH-TENANT-004
import { describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { AuthLoginEventRecord, AuthLoginEventRepositoryPort } from '@app/backend-feature-auth-shared';
import {
  AuthLoginAnalyticsAdminPersistenceError,
  AuthLoginAnalyticsAdminService,
} from './auth-login-analytics-admin.service';

describe('AuthLoginAnalyticsAdminService', () => {
  it('keeps event and summary queries tenant scoped and maps retained evidence', async () => {
    const event = {
      id: 'event-id',
      tenantId: '00000000-0000-4000-8000-000000000001',
      userId: null,
      identifierHash: null,
      sessionId: null,
      eventType: 'login',
      outcome: 'success',
      provider: 'password',
      channel: 'password',
      failureCode: null,
      ipAddress: '203.0.113.1',
      ipHash: null,
      countryCode: null,
      region: null,
      city: null,
      language: 'en',
      timezone: 'UTC',
      timezoneSource: null,
      languageSource: null,
      userAgent: null,
      requestId: null,
      occurredAt: new Date(),
      networkAnonymizedAt: null,
    } satisfies AuthLoginEventRecord;
    const repository = {
      list: vi.fn(() => okAsync([event])),
      count: vi.fn(() => okAsync(1)),
      summary: vi.fn(() =>
        okAsync({
          total: 1,
          successful: 1,
          failed: 0,
          uniqueUsers: 1,
          successRate: 100,
          byCountry: [],
          byLanguage: [],
          byTimezone: [],
          byProvider: [{ key: 'password', count: 1 }],
        }),
      ),
    } as unknown as AuthLoginEventRepositoryPort;
    const service = new AuthLoginAnalyticsAdminService(repository);
    const query = { outcome: 'success' as const, limit: 10, offset: 2, occurredFrom: '2026-07-01T00:00:00.000Z' };
    await expect(service.list(event.tenantId, query)).resolves.toMatchObject({
      total: 1,
      limit: 10,
      offset: 2,
      items: [{ id: event.id, ipAddress: '203.0.113.1', networkAnonymized: false }],
    });
    await expect(service.summary(event.tenantId, query)).resolves.toMatchObject({ total: 1, successRate: 100 });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: event.tenantId,
        outcome: 'success',
        occurredFrom: new Date(query.occurredFrom),
      }),
    );
  });

  it('maps repository failures to the admin persistence boundary', async () => {
    const repository = {
      list: vi.fn(() => errAsync({ code: 'repository_error' as const, message: 'offline' })),
      count: vi.fn(() => okAsync(0)),
      summary: vi.fn(() => errAsync({ code: 'repository_error' as const, message: 'offline' })),
    } as unknown as AuthLoginEventRepositoryPort;
    const service = new AuthLoginAnalyticsAdminService(repository);
    await expect(service.list('00000000-0000-4000-8000-000000000001', {})).rejects.toBeInstanceOf(
      AuthLoginAnalyticsAdminPersistenceError,
    );
    await expect(service.summary('00000000-0000-4000-8000-000000000001', {})).rejects.toBeInstanceOf(
      AuthLoginAnalyticsAdminPersistenceError,
    );
  });
});
