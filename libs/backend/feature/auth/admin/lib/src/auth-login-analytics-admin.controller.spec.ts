import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { AuthLoginAnalyticsAdminController } from './auth-login-analytics-admin.controller';
import {
  AuthLoginAnalyticsAdminPersistenceError,
  type AuthLoginAnalyticsAdminService,
} from './auth-login-analytics-admin.service';

const principal: AuthenticatedPrincipal = {
  subject: '00000000-0000-4000-8000-000000000002',
  tenantId: '00000000-0000-4000-8000-000000000001',
  roles: ['admin'],
  permissions: ['admin:auth-login-analytics:read'],
};

describe('AuthLoginAnalyticsAdminController', () => {
  it('returns response envelopes for list and summary queries', async () => {
    const service = {
      list: vi.fn(() => Promise.resolve({ items: [], total: 0, limit: 50, offset: 0 })),
      summary: vi.fn(() =>
        Promise.resolve({
          total: 0,
          successful: 0,
          failed: 0,
          uniqueUsers: 0,
          successRate: 0,
          byCountry: [],
          byLanguage: [],
          byTimezone: [],
          byProvider: [],
        }),
      ),
    } as unknown as AuthLoginAnalyticsAdminService;
    const controller = new AuthLoginAnalyticsAdminController(service);
    await expect(controller.list(principal, {})).resolves.toEqual({
      data: { items: [], total: 0, limit: 50, offset: 0 },
    });
    await expect(controller.summary(principal, {})).resolves.toMatchObject({ data: { total: 0 } });
    expect(service.list).toHaveBeenCalledWith(principal.tenantId, {});
  });

  it('hides persistence details behind a generic HTTP failure', async () => {
    const service = {
      list: vi.fn(() => Promise.reject(new AuthLoginAnalyticsAdminPersistenceError())),
    } as unknown as AuthLoginAnalyticsAdminService;
    await expect(new AuthLoginAnalyticsAdminController(service).list(principal, {})).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
