import { describe, expect, it } from "vitest";
import { DefaultFeatureFlagTenantId } from "@app/common/feature-flags";
import {
  FeatureFlagEntity,
  FeatureFlagEntitySchema,
} from "./feature-flag.entity";

describe("FeatureFlagEntity", () => {
  it("defaults feature flags to the shared tenant and enabled DB-backed values", () => {
    const entity = new FeatureFlagEntity({
      key: "billing.portal",
      value: true,
    });

    expect(entity).toMatchObject({
      tenantId: DefaultFeatureFlagTenantId,
      key: "billing.portal",
      value: true,
      description: "",
      enabled: true,
    });
  });

  it("maps to the persistent feature_flags table schema", () => {
    expect(FeatureFlagEntitySchema.meta.tableName).toBe("feature_flags");
    expect(FeatureFlagEntitySchema.meta.uniques).toContainEqual({
      name: "uq__feature_flags__tenant_id_key",
      properties: ["tenantId", "key"],
    });
    expect(FeatureFlagEntitySchema.meta.checks).toContainEqual({
      name: "ck__feature_flags__key",
      expression: "\"key\" ~ '^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*$'",
    });
  });
});
