import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import {
  ADMIN_MANAGE_ALL_PERMISSION,
  ADMIN_PROFILE_READ_PERMISSION,
  ADMIN_ROLE,
  ADMIN_USERS_READ_PERMISSION,
} from "@app/backend/feature-admin-shared";
import {
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  DEFAULT_AUTH_TENANT_ID,
  REQUIRED_PERMISSIONS_METADATA_KEY,
  REQUIRED_ROLES_METADATA_KEY,
} from "@app/feature-auth-shared";
import { AdminRbacGuard } from "./admin-rbac.guard";
import { AdminProfileController } from "./admin-profile.controller";
import { AdminUsersController } from "./admin-users.controller";

function createContext(
  request: AuthenticatedRequest,
  handler: () => undefined = () => undefined,
  controller: new () => unknown = class AdminTestController {},
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

function createPrincipal(
  partial: Partial<AuthenticatedPrincipal>,
): AuthenticatedPrincipal {
  return {
    permissions: [],
    roles: [],
    subject: "admin-id",
    tenantId: DEFAULT_AUTH_TENANT_ID,
    ...partial,
  };
}

function createGuardedHandler(permission: string): () => undefined {
  const handler = () => undefined;
  Reflect.defineMetadata(REQUIRED_ROLES_METADATA_KEY, [ADMIN_ROLE], handler);
  Reflect.defineMetadata(
    REQUIRED_PERMISSIONS_METADATA_KEY,
    [permission],
    handler,
  );

  return handler;
}

describe("AdminRbacGuard", () => {
  it("wires admin controllers through the admin RBAC adapter", () => {
    expect(
      Reflect.getMetadata("__guards__", AdminProfileController),
    ).toContainEqual(expect.any(AdminRbacGuard));
    expect(
      Reflect.getMetadata("__guards__", AdminUsersController),
    ).toContainEqual(expect.any(AdminRbacGuard));
  });

  it("denies protected admin routes without permission metadata", () => {
    class AdminNoMetadataController {}
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({ roles: [ADMIN_ROLE] }),
            url: "/admin/nope",
          },
          () => undefined,
          AdminNoMetadataController,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it("denies unknown admin permissions", () => {
    const handler = createGuardedHandler("admin:unknown:read");
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: ["admin:unknown:read"],
              roles: [ADMIN_ROLE],
            }),
          },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it("denies admin role alone", () => {
    const handler = createGuardedHandler(ADMIN_USERS_READ_PERMISSION);
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          { user: createPrincipal({ roles: [ADMIN_ROLE] }) },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it("ignores admin permissions without the admin role", () => {
    const handler = createGuardedHandler(ADMIN_USERS_READ_PERMISSION);
    const guard = new AdminRbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: [ADMIN_USERS_READ_PERMISSION],
              roles: ["support"],
            }),
          },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it("allows explicit manage/all admin permission for admin route permissions", () => {
    const handler = createGuardedHandler(ADMIN_PROFILE_READ_PERMISSION);

    expect(
      new AdminRbacGuard(new Reflector()).canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: [ADMIN_MANAGE_ALL_PERMISSION],
              roles: [ADMIN_ROLE],
            }),
          },
          handler,
        ),
      ),
    ).toBe(true);
  });
});
