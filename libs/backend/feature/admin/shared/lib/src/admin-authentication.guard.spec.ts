import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { HealthRouteMetadataKey } from '@app/backend-common-health';
import { DefaultAuthTenantId, type AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { AdminAuthenticationGuard } from './admin-authentication.guard';

const contextFor = (request: AuthenticatedRequest, handler: () => undefined = () => undefined) =>
  ({
    getHandler: () => handler,
    getClass: () => class AdminTestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe(AdminAuthenticationGuard.name, () => {
  it('authenticates an admin app request through the shared session guard', () => {
    const principal = {
      subject: 'admin-id',
      tenantId: DefaultAuthTenantId,
      roles: ['admin'],
      permissions: ['admin:profile:read'],
    };
    const request: AuthenticatedRequest = { session: { user: principal } };

    expect(new AdminAuthenticationGuard(new Reflector()).canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual(principal);
  });

  it('rejects unauthenticated non-health routes', () => {
    expect(() => new AdminAuthenticationGuard(new Reflector()).canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('keeps shared health routes available to probes', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(HealthRouteMetadataKey, true, handler);

    expect(new AdminAuthenticationGuard(new Reflector()).canActivate(contextFor({}, handler))).toBe(true);
  });
});
