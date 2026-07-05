import type { EntityManager } from "@mikro-orm/core";
import { describe, expect, it, vi } from "vitest";
import {
  AuthPermissionEntity,
  AuthRoleEntity,
  AuthRolePermissionEntity,
  AuthUserRoleEntity,
} from "../../entities";
import {
  reconcileUserRoles,
  resolveEffectiveAccess,
} from "./reconcile-user-roles.util";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

function role(id: string, key: string): AuthRoleEntity {
  const entity = new AuthRoleEntity({ key });
  entity.id = id;
  return entity;
}

function permission(id: string, key: string): AuthPermissionEntity {
  const entity = new AuthPermissionEntity({
    key,
    resource: "res",
    action: "act",
  });
  entity.id = id;
  return entity;
}

function createFindMock(byEntity: {
  roles?: AuthRoleEntity[];
  userRoles?: AuthUserRoleEntity[];
  rolePermissions?: AuthRolePermissionEntity[];
  permissions?: AuthPermissionEntity[];
}) {
  return vi.fn((entity: unknown) => {
    if (entity === AuthRoleEntity) {
      return Promise.resolve(byEntity.roles ?? []);
    }
    if (entity === AuthUserRoleEntity) {
      return Promise.resolve(byEntity.userRoles ?? []);
    }
    if (entity === AuthRolePermissionEntity) {
      return Promise.resolve(byEntity.rolePermissions ?? []);
    }
    return Promise.resolve(byEntity.permissions ?? []);
  });
}

describe("reconcileUserRoles", () => {
  it("deletes stale assignments and skips the role lookup when no keys are desired", async () => {
    const find = createFindMock({
      userRoles: [new AuthUserRoleEntity({ userId, roleId: "role-stale" })],
    });
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(1));
    const em = { find, persist, nativeDelete } as unknown as EntityManager;

    await reconcileUserRoles(em, tenantId, userId, actorUserId, []);

    expect(find).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
    expect(nativeDelete).toHaveBeenCalledWith(AuthUserRoleEntity, {
      userId,
      tenantId,
      roleId: { $in: ["role-stale"] },
    });
  });

  it("inserts missing assignments without deleting when nothing is removed", async () => {
    const find = createFindMock({
      roles: [role("role-user", "user")],
      userRoles: [],
    });
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(0));
    const em = { find, persist, nativeDelete } as unknown as EntityManager;

    await reconcileUserRoles(em, tenantId, userId, actorUserId, ["user"]);

    expect(persist).toHaveBeenCalledTimes(1);
    const persisted = persist.mock.calls[0]?.[0] as AuthUserRoleEntity;
    expect(persisted.roleId).toBe("role-user");
    expect(persisted.grantedByUserId).toBe(actorUserId);
    expect(nativeDelete).not.toHaveBeenCalled();
  });
});

describe("resolveEffectiveAccess", () => {
  it("returns empty access when the user has no assignments", async () => {
    const find = createFindMock({ userRoles: [] });
    const em = { find } as unknown as EntityManager;

    await expect(resolveEffectiveAccess(em, tenantId, userId)).resolves.toEqual(
      { roleKeys: [], permissionKeys: [] },
    );
  });

  it("orders non-catalog keys alphabetically as a stable tie-break", async () => {
    const find = createFindMock({
      userRoles: [
        new AuthUserRoleEntity({ userId, roleId: "role-1" }),
        new AuthUserRoleEntity({ userId, roleId: "role-2" }),
      ],
      roles: [role("role-1", "zeta-custom"), role("role-2", "alpha-custom")],
      rolePermissions: [
        new AuthRolePermissionEntity({
          roleId: "role-1",
          permissionId: "perm-1",
        }),
        new AuthRolePermissionEntity({
          roleId: "role-2",
          permissionId: "perm-2",
        }),
      ],
      permissions: [
        permission("perm-1", "zeta:custom"),
        permission("perm-2", "alpha:custom"),
      ],
    });
    const em = { find } as unknown as EntityManager;

    await expect(resolveEffectiveAccess(em, tenantId, userId)).resolves.toEqual(
      {
        roleKeys: ["alpha-custom", "zeta-custom"],
        permissionKeys: ["alpha:custom", "zeta:custom"],
      },
    );
  });
});
