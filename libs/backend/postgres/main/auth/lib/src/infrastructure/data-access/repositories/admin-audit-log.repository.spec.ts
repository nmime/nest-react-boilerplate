import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import { AdminAuditLogEntity, DefaultAuthTenantId } from "../entities";
import { AdminAuditLogRepository } from "./admin-audit-log.repository";

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const find = vi.fn(() => Promise.resolve<AdminAuditLogEntity[]>([]));
  const count = vi.fn(() => Promise.resolve(0));
  const entityManager = {
    persist,
    flush,
    find,
    count,
  } as unknown as EntityManager;

  return { persist, flush, find, count, entityManager };
}

describe("AdminAuditLogRepository", () => {
  it("records audit logs through MikroORM", async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);

    const result = await auditLogs.record({
      tenantId: "00000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000002",
      action: "admin.user.status.update",
      resource: "admin.users",
      targetUserId: "00000000-0000-4000-8000-000000000003",
      before: { status: "active" },
      after: { status: "disabled" },
      metadata: { requestId: "req-1" },
    });

    const entity = result._unsafeUnwrap();
    expect(entity).toMatchObject({
      tenantId: "00000000-0000-4000-8000-000000000001",
      actorUserId: "00000000-0000-4000-8000-000000000002",
      action: "admin.user.status.update",
      resource: "admin.users",
      targetUserId: "00000000-0000-4000-8000-000000000003",
      before: { status: "active" },
      after: { status: "disabled" },
      metadata: { requestId: "req-1" },
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("lists and counts with tenant-scoped filters, capped pagination, and deterministic ordering", async () => {
    const entity = new AdminAuditLogEntity({
      action: "admin.user.status.update",
      resource: "admin.users",
    });
    const { find, count, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([entity]);
    count.mockResolvedValue(1);
    const auditLogs = new AdminAuditLogRepository(entityManager);

    await expect(
      auditLogs
        .list({
          tenantId: "00000000-0000-4000-8000-000000000001",
          action: "admin.user.status.update",
          actorUserId: "00000000-0000-4000-8000-000000000002",
          targetUserId: "00000000-0000-4000-8000-000000000003",
          limit: 1_000,
          offset: -10,
        })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toEqual([entity]);
    await expect(
      auditLogs
        .count({
          tenantId: "00000000-0000-4000-8000-000000000001",
          action: "admin.user.status.update",
        })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toBe(1);

    expect(find).toHaveBeenCalledWith(
      AdminAuditLogEntity,
      {
        tenantId: "00000000-0000-4000-8000-000000000001",
        action: "admin.user.status.update",
        actorUserId: "00000000-0000-4000-8000-000000000002",
        targetUserId: "00000000-0000-4000-8000-000000000003",
      },
      { limit: 100, offset: 0, orderBy: { createdAt: "DESC", id: "DESC" } },
    );
    expect(count).toHaveBeenCalledWith(AdminAuditLogEntity, {
      tenantId: "00000000-0000-4000-8000-000000000001",
      action: "admin.user.status.update",
    });
  });

  it("defaults tenant and clamps invalid pagination at repository level", async () => {
    const { find, entityManager } = createEntityManagerMock();
    const auditLogs = new AdminAuditLogRepository(entityManager);

    await auditLogs.list({ limit: 0, offset: Number.NaN });

    expect(find).toHaveBeenCalledWith(
      AdminAuditLogEntity,
      { tenantId: DefaultAuthTenantId },
      { limit: 1, offset: 0, orderBy: { createdAt: "DESC", id: "DESC" } },
    );
  });

  it("maps repository failures", async () => {
    const { flush, entityManager } = createEntityManagerMock();
    flush.mockRejectedValue(new Error("audit insert failed"));
    const auditLogs = new AdminAuditLogRepository(entityManager);

    const result = await auditLogs.record({
      action: "admin.user.status.update",
      resource: "admin.users",
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "audit insert failed",
    });
  });
});
