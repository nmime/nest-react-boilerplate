import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import {
  DefaultFeatureFlagTenantId,
  type FeatureFlagValue,
} from "@app/common/feature-flags";

export interface FeatureFlagEntityInput {
  tenantId?: string;
  key: string;
  value: FeatureFlagValue;
  description?: string | null;
  enabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class FeatureFlagEntity {
  id: string = randomUUID();
  tenantId: string = DefaultFeatureFlagTenantId;
  key!: string;
  value: FeatureFlagValue = false;
  description = "";
  enabled = true;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: FeatureFlagEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultFeatureFlagTenantId;
      this.key = input.key;
      this.value = input.value;
      this.description = input.description ?? "";
      this.enabled = input.enabled ?? true;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

export const FeatureFlagEntitySchema = new EntitySchema<FeatureFlagEntity>({
  class: FeatureFlagEntity,
  tableName: "feature_flags",
  properties: {
    id: { type: "uuid", primary: true },
    tenantId: {
      type: "uuid",
      fieldName: "tenant_id",
      default: DefaultFeatureFlagTenantId,
    },
    key: { type: "varchar", length: 160 },
    value: { type: "json", defaultRaw: "'false'::jsonb" },
    description: { type: "text", default: "" },
    enabled: { type: "boolean", default: true },
    createdAt: {
      type: "timestamptz",
      fieldName: "created_at",
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: "timestamptz",
      fieldName: "updated_at",
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [{ name: "ix__feature_flags__tenant_id", properties: ["tenantId"] }],
  uniques: [
    {
      name: "uq__feature_flags__tenant_id_key",
      properties: ["tenantId", "key"],
    },
  ],
  checks: [
    {
      name: "ck__feature_flags__key",
      expression: "\"key\" ~ '^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*$'",
    },
  ],
});
