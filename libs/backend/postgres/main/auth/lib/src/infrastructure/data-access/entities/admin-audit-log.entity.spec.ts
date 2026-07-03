import { describe, expect, it } from "vitest";
import {
  AdminAuditLogEntity,
  AdminAuditLogEntitySchema,
  DefaultAuthTenantId,
} from "./index";

describe("AdminAuditLogEntity", () => {
  it("defaults nullable user references to null for uuid columns", () => {
    const entity = new AdminAuditLogEntity({
      action: "admin.user.status.update",
      resource: "admin.users",
    });

    expect(entity).toMatchObject({
      tenantId: DefaultAuthTenantId,
      actorUserId: null,
      action: "admin.user.status.update",
      resource: "admin.users",
      targetUserId: null,
      before: {},
      after: {},
      metadata: {},
    });
  });

  it("registers nullable uuid user references without empty-string defaults", () => {
    AdminAuditLogEntitySchema.init();

    expect(AdminAuditLogEntitySchema.meta.properties.actorUserId).toMatchObject(
      {
        type: "uuid",
        nullable: true,
      },
    );
    expect(
      AdminAuditLogEntitySchema.meta.properties.actorUserId.default,
    ).toBeUndefined();
    expect(
      AdminAuditLogEntitySchema.meta.properties.targetUserId,
    ).toMatchObject({
      type: "uuid",
      nullable: true,
    });
    expect(
      AdminAuditLogEntitySchema.meta.properties.targetUserId.default,
    ).toBeUndefined();
  });
});
