import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminUsersReadPermission,
} from '@app/backend-feature-admin-shared';
import {
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type PermissionEvaluationContext,
  DefaultAuthTenantId,
  RequiredPermissionsMetadataKey,
  RequiredRolesMetadataKey,
} from '@app/backend-feature-auth-shared';
import { AdminRbacGuard } from '@app/backend-feature-admin-shared';
import { AdminProfileController } from './admin-profile.controller';
import { AdminUsersController } from './admin-users.controller';

function createContext(
  request: AuthenticatedRequest,
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
  Reflect.defineMetadata(RequiredRolesMetadataKey, [AdminRole], handler);
  Reflect.defineMetadata(RequiredPermissionsMetadataKey, [permission], handler);

  return handler;
}

describe('AdminRbacGuard', () => {
  it('wires admin controllers through the admin RBAC adapter', () => {
    expect(Reflect.getMetadata('__guards__', AdminProfileController)).toContainEqual(expect.any(AdminRbacGuard));
    expect(Reflect.getMetadata('__guards__', AdminUsersController)).toContainEqual(expect.any(AdminRbacGuard));
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

  it('ignores admin permissions without the admin role', () => {
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

  it('allows explicit manage/all admin permission for admin route permissions', () => {
    const handler = createGuardedHandler(AdminProfileReadPermission);

    expect(
      new AdminRbacGuard(new Reflector()).canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: [AdminManageAllPermission],
              roles: [AdminRole],
            }),
          },
          handler,
        ),
      ),
    ).toBe(true);
  });

  it('defers non-admin permissions to the base RBAC evaluation', () => {
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
        requiredRoles: ['user'],
      }),
    ).toBeUndefined();
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
