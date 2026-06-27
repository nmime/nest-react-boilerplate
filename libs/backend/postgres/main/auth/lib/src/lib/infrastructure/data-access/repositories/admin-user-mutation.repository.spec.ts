import { LockMode, type EntityManager } from "@mikro-orm/core";
import { describe, expect, it, vi } from "vitest";
import {
  AdminAuditLogEntity,
  AuthUserEntity,
  TransactionalOutboxEventEntity,
} from "../entities";
import {
  ADMIN_ROLE_NAME,
  ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION_NAME,
  ADMIN_USERS_WRITE_PERMISSION_NAME,
  AdminUserMutationRepository,
  hasActivePowerfulAdminAccess,
} from "./admin-user-mutation.repository";

const tenantId = "00000000-0000-4000-8000-000000000001";
const targetUserId = "00000000-0000-4000-8000-000000000002";
const actorUserId = "00000000-0000-4000-8000-000000000003";

function createPowerfulAdmin(partial: Partial<AuthUserEntity> = {}) {
  const entity = new AuthUserEntity({
    tenantId,
    email: "admin@example.com",
    status: "active",
    roles: [ADMIN_ROLE_NAME],
    permissions: [
      ADMIN_USERS_WRITE_PERMISSION_NAME,
      ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION_NAME,
    ],
  });
  entity.id = targetUserId;
  Object.assign(entity, partial);

  return entity;
}

function createEntityManagerMock(
  input: {
    user?: AuthUserEntity | null;
    powerfulAdminCount?: number;
    flush?: () => Promise<void>;
  } = {},
) {
  const user = input.user === undefined ? createPowerfulAdmin() : input.user;
  const execute = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve(user));
  const count = vi.fn(() => Promise.resolve(input.powerfulAdminCount ?? 2));
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(input.flush ?? (() => Promise.resolve()));
  const transactionalEntityManager = {
    getConnection: () => ({ execute }),
    findOne,
    count,
    persist,
    flush,
  } as unknown as EntityManager;
  const transactional = vi.fn(
    async (callback: (em: EntityManager) => unknown) => {
      const snapshot = user ? createPowerfulAdmin(user) : null;

      try {
        return await callback(transactionalEntityManager);
      } catch (error) {
        if (user && snapshot) {
          Object.assign(user, snapshot);
        }
        throw error;
      }
    },
  );
  const entityManager = {
    transactional,
  } as unknown as EntityManager;

  return {
    count,
    entityManager,
    execute,
    findOne,
    flush,
    persist,
    transactional,
    transactionalEntityManager,
    user,
  };
}

describe("AdminUserMutationRepository", () => {
  it("detects effective active powerful admins by permissions, not just admin role", () => {
    expect(hasActivePowerfulAdminAccess(createPowerfulAdmin())).toBe(true);
    expect(
      hasActivePowerfulAdminAccess(
        createPowerfulAdmin({
          permissions: [ADMIN_USERS_WRITE_PERMISSION_NAME],
        }),
      ),
    ).toBe(false);
    expect(
      hasActivePowerfulAdminAccess(
        createPowerfulAdmin({ roles: [ADMIN_ROLE_NAME] }),
      ),
    ).toBe(true);
    expect(
      hasActivePowerfulAdminAccess(createPowerfulAdmin({ status: "disabled" })),
    ).toBe(false);
  });

  it("mutates user, audit log, and outbox row in one locked transaction", async () => {
    const { entityManager, execute, findOne, count, persist, flush, user } =
      createEntityManagerMock({ powerfulAdminCount: 2 });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: "admin.user.status.update",
      policy: { status: "disabled" },
      audit: { metadata: { requestId: "req-1" } },
    });

    const mutation = result._unsafeUnwrap();
    expect(mutation?.before.status).toBe("active");
    expect(mutation?.after.status).toBe("disabled");
    expect(user?.status).toBe("disabled");
    expect(execute).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtext(?))",
      [`admin-user-sensitive-mutation:${tenantId}`],
    );
    expect(findOne).toHaveBeenCalledWith(
      AuthUserEntity,
      { id: targetUserId, tenantId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(count).toHaveBeenCalledWith(AuthUserEntity, {
      tenantId,
      status: "active",
      roles: { $contains: [ADMIN_ROLE_NAME] },
      permissions: {
        $contains: [
          ADMIN_USERS_WRITE_PERMISSION_NAME,
          ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION_NAME,
        ],
      },
    });
    expect(persist).toHaveBeenCalledWith([
      expect.any(AdminAuditLogEntity),
      expect.any(TransactionalOutboxEventEntity),
    ]);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(mutation?.auditLog).toMatchObject({
      action: "admin.user.status.update",
      before: { status: "active" },
      after: { status: "disabled" },
      metadata: { requestId: "req-1" },
    });
    expect(mutation?.outboxEvent).toMatchObject({
      aggregateType: "admin.user",
      aggregateId: targetUserId,
      eventType: "admin.user.status.update",
      status: "pending",
      metadata: { requestId: "req-1" },
    });
  });

  it("blocks removing the only powerful admin even when another active admin role holder exists without permissions", async () => {
    const { entityManager, persist, flush } = createEntityManagerMock({
      powerfulAdminCount: 1,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: "admin.user.access_policy.update",
      policy: {
        roles: [ADMIN_ROLE_NAME],
        permissions: [ADMIN_USERS_WRITE_PERMISSION_NAME],
      },
      audit: { metadata: { requestId: "req-1" } },
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message:
        "At least one active administrator must retain admin write access.",
    });
    expect(persist).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it("rolls back mutation when audit or outbox persistence fails", async () => {
    const { entityManager, user } = createEntityManagerMock({
      flush: () => Promise.reject(new Error("audit insert failed")),
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: "admin.user.status.update",
      policy: { status: "disabled" },
      audit: { metadata: { requestId: "req-1" } },
    });

    expect(user?.status).toBe("active");
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "audit insert failed",
    });
  });

  it("returns null for missing users without writing audit or outbox rows", async () => {
    const { entityManager, persist, flush } = createEntityManagerMock({
      user: null,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: "admin.user.status.update",
      policy: { status: "disabled" },
      audit: { metadata: {} },
    });

    expect(result._unsafeUnwrap()).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
});
