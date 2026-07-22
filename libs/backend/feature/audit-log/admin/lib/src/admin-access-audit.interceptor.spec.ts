import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import type { AuditLogAdminService } from './audit-log-admin.service';
import { adminAuditResourceForPath, AdminAccessAuditInterceptor } from './admin-access-audit.interceptor';

const contextFor = (request: Record<string, unknown>) =>
  ({
    getType: () => 'http',
    getClass: () => ({ name: 'AdminUsersController' }),
    getHandler: () => ({ name: 'listUsers' }),
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('AdminAccessAuditInterceptor', () => {
  it('records authenticated admin access before invoking the handler', async () => {
    const order: string[] = [];
    const audit = {
      record: vi.fn(async () => {
        order.push('audit');
        return {} as never;
      }),
    } as unknown as AuditLogAdminService;
    const next = {
      handle: vi.fn(() => {
        order.push('handler');
        return of('ok');
      }),
    } as CallHandler;
    const result = await firstValueFrom(
      new AdminAccessAuditInterceptor(audit).intercept(
        contextFor({
          method: 'GET',
          routeOptions: { url: '/admin/users/:id' },
          ip: '203.0.113.1',
          headers: { 'user-agent': 'Browser' },
          user: { subject: '00000000-0000-4000-8000-000000000002', tenantId: '00000000-0000-4000-8000-000000000001' },
        }),
        next,
      ),
    );
    expect(result).toBe('ok');
    expect(order).toEqual(['audit', 'handler']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.access',
        resource: 'admin.users',
        metadata: expect.objectContaining({ method: 'GET', route: '/admin/users/:id', ipAddress: '203.0.113.1' }),
      }),
    );
  });

  it('passes through non-http and unauthenticated requests without audit writes', async () => {
    const audit = { record: vi.fn() } as unknown as AuditLogAdminService;
    const next = { handle: vi.fn(() => of('ok')) } as CallHandler;
    await firstValueFrom(new AdminAccessAuditInterceptor(audit).intercept(contextFor({ url: '/health' }), next));
    const rpc = { ...contextFor({}), getType: () => 'rpc' } as unknown as ExecutionContext;
    await firstValueFrom(new AdminAccessAuditInterceptor(audit).intercept(rpc, next));
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('fails closed when durable audit evidence cannot be written', async () => {
    const audit = {
      record: vi.fn(() => Promise.reject(new Error('audit unavailable'))),
    } as unknown as AuditLogAdminService;
    const next = { handle: vi.fn(() => of('should not run')) } as CallHandler;

    await expect(
      firstValueFrom(
        new AdminAccessAuditInterceptor(audit).intercept(
          contextFor({
            url: '/admin/roles',
            user: { subject: 'actor', tenantId: '00000000-0000-4000-8000-000000000001' },
          }),
          next,
        ),
      ),
    ).rejects.toThrow('audit unavailable');
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('classifies every shipped admin resource, including nested settings and notification routes', () => {
    expect(adminAuditResourceForPath('/admin/profile/me')).toBe('admin.profile');
    expect(adminAuditResourceForPath('/admin/users/user-1/access-policy')).toBe('admin.users');
    expect(adminAuditResourceForPath('/admin/roles/role-1/permissions')).toBe('admin.roles');
    expect(adminAuditResourceForPath('/admin/audit/meta')).toBe('admin.audit');
    expect(adminAuditResourceForPath('/admin/auth/login-analytics/summary')).toBe('admin.auth-login-analytics');
    expect(adminAuditResourceForPath('/admin/settings/problem-presentations')).toBe('admin.settings');
    expect(adminAuditResourceForPath('/admin/notification-templates/template-1')).toBe('admin.notification-templates');
    expect(adminAuditResourceForPath('/admin/notification-segments/segment-1')).toBe('admin.notification-segments');
    expect(adminAuditResourceForPath('/admin/notification-broadcasts/broadcast-1')).toBe(
      'admin.notification-broadcasts',
    );
    expect(adminAuditResourceForPath('/admin/feature-flags/checkout.newflow')).toBe('admin.feature-flags');
    expect(adminAuditResourceForPath('/admin/unknown')).toBe('admin.unknown');
  });
});
