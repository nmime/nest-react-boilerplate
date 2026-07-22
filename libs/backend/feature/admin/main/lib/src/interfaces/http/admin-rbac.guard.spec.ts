import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminUsersReadPermission,
  createAdminAbility,
  type AdminAuthorizedRequest,
} from '@app/backend-feature-admin-shared';
import {
  type AuthenticatedPrincipal,
  type PermissionEvaluationContext,
  DefaultAuthTenantId,
  RequiredPermissionsMetadataKey,
} from '@app/backend-feature-auth-shared';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';
import { AdminProfileController } from './admin-profile.controller';
import { AdminFeatureFlagsController } from './admin-feature-flags.controller';
import { AdminUsersController } from './admin-users.controller';

function createContext(
  request: AdminAuthorizedRequest,
  handler: () => undefined = () => undefined,
  controller: new () => unknown = class AdminTestController {},
): ExecutionContext {
  const context = {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return context as unknown as ExecutionContext;
}

function createPrincipal(partial: Partial<AuthenticatedPrincipal>): AuthenticatedPrincipal {
  return {
    permissions: [],
    roles: [],
    subject: 'admin-id',
    tenantId: DefaultAuthTenantId,
    ...partial,
  };
}

function createGuardedHandler(permission: string): () => undefined {
  const handler = () => undefined;
  Reflect.defineMetadata(RequiredPermissionsMetadataKey, [permission], handler);

  return handler;
}

function authorizedRequest(principal: AuthenticatedPrincipal): AdminAuthorizedRequest {
  return {
    user: principal,
    adminAbility: createAdminAbility(principal),
  };
}

describe('AdminRbacGuard', () => {
  it('wires admin controllers through the admin RBAC adapter', () => {
    expect(Reflect.getMetadata('__guards__', AdminProfileController)).toContainEqual(expect.any(AdminRbacGuard));
    expect(Reflect.getMetadata('__guards__', AdminUsersController)).toContainEqual(expect.any(AdminRbacGuard));
    expect(Reflect.getMetadata('__guards__', AdminFeatureFlagsController)).toContainEqual(expect.any(AdminRbacGuard));
  });

  it('denies protected admin routes without permission metadata', () => {
    class AdminNoMetadataController {}
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({ roles: [AdminRole] }),
            url: '/admin/nope',
          },
          () => undefined,
          AdminNoMetadataController,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies unknown admin permissions', () => {
    const handler = createGuardedHandler('admin:unknown:read');
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: ['admin:unknown:read'],
              roles: [AdminRole],
            }),
          },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies admin role alone', () => {
    const handler = createGuardedHandler(AdminUsersReadPermission);
    const guard = new AdminRbacGuard(new Reflector());

    expect(() => guard.canActivate(createContext({ user: createPrincipal({ roles: [AdminRole] }) }, handler))).toThrow(
      ForbiddenException,
    );
  });

  it('allows database-resolved custom roles with the required admin permission', () => {
    const handler = createGuardedHandler(AdminUsersReadPermission);
    const guard = new AdminRbacGuard(new Reflector());

    expect(
      guard.canActivate(
        createContext(
          authorizedRequest(
            createPrincipal({
              permissions: [AdminUsersReadPermission],
              roles: ['support'],
            }),
          ),
          handler,
        ),
      ),
    ).toBe(true);
  });

  it('allows explicit manage/all admin permission for admin route permissions', () => {
    const handler = createGuardedHandler(AdminProfileReadPermission);

    expect(
      new AdminRbacGuard(new Reflector()).canActivate(
        createContext(
          authorizedRequest(
            createPrincipal({
              permissions: [AdminManageAllPermission],
              roles: [AdminRole],
            }),
          ),
          handler,
        ),
      ),
    ).toBe(true);
  });

  it('denies non-admin permissions instead of falling back to generic RBAC', () => {
    class ExposedAdminRbacGuard extends AdminRbacGuard {
      evaluate(context: PermissionEvaluationContext): boolean | undefined {
        return this.evaluateDomainPermission(context);
      }
    }
    const guard = new ExposedAdminRbacGuard(new Reflector());

    expect(
      guard.evaluate({
        permission: 'profile:read',
        principal: createPrincipal({
          permissions: ['profile:read'],
          roles: ['user'],
        }),
        request: {},
        requiredRoles: ['user'],
      }),
    ).toBe(false);
  });

  it('fails closed when token claims exist without a database-derived CASL ability', () => {
    const handler = createGuardedHandler(AdminUsersReadPermission);
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: [AdminUsersReadPermission],
              roles: ['support'],
            }),
          },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('treats the /admin root path as an admin route for non-admin classes', () => {
    class PlainController {}
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          { user: createPrincipal({ roles: [AdminRole] }), url: '/admin' },
          () => undefined,
          PlainController,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('treats nested /admin/ paths as admin routes for non-admin classes', () => {
    class PlainController {}
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({ roles: [AdminRole] }),
            url: '/admin/users',
          },
          () => undefined,
          PlainController,
        ),
      ),
    ).toThrow(ForbiddenException);
  });
});
