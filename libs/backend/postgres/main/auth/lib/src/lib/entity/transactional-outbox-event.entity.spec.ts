import { describe, expect, it } from "vitest";
import {
  DefaultAuthTenantId,
  TransactionalOutboxEventEntity,
  TransactionalOutboxEventEntitySchema,
} from "./index";

describe("TransactionalOutboxEventEntity", () => {
  it("defaults pending persistence-only outbox rows", () => {
    const entity = new TransactionalOutboxEventEntity({
      aggregateType: "admin.user",
      aggregateId: "00000000-0000-4000-8000-000000000001",
      eventType: "admin.user.status.update",
    });

    expect(entity).toMatchObject({
      tenantId: DefaultAuthTenantId,
      aggregateType: "admin.user",
      aggregateId: "00000000-0000-4000-8000-000000000001",
      eventType: "admin.user.status.update",
      payload: {},
      metadata: {},
      status: "pending",
      publishedAt: null,
    });
    expect(TransactionalOutboxEventEntitySchema.meta.tableName).toBe(
      "transactional_outbox_events",
    );
  });
});
