import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { DefaultAuthTenantId } from "./auth-user.entity";

export type AdminAuditAction =
  | "admin.user.status.update"
  | "admin.user.access_policy.update";

export interface AdminAuditLogEntityInput {
  tenantId?: string;
  actorUserId?: string | null;
  action: AdminAuditAction;
  resource: string;
  targetUserId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export class AdminAuditLogEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  actorUserId = "";
  action!: string;
  resource!: string;
  targetUserId = "";
  before: Record<string, unknown> = {};
  after: Record<string, unknown> = {};
  metadata: Record<string, unknown> = {};
  createdAt: Date = new Date();

  constructor(input?: AdminAuditLogEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.actorUserId = input.actorUserId ?? "";
      this.action = input.action;
      this.resource = input.resource;
      this.targetUserId = input.targetUserId ?? "";
      this.before = input.before ?? {};
      this.after = input.after ?? {};
      this.metadata = input.metadata ?? {};
      this.createdAt = input.createdAt ?? new Date();
    }
  }
}

export const AdminAuditLogEntitySchema = new EntitySchema<AdminAuditLogEntity>({
  class: AdminAuditLogEntity,
  tableName: "admin_audit_logs",
  properties: {
    id: { type: "uuid", primary: true },
    tenantId: {
      type: "uuid",
      fieldName: "tenant_id",
      default: DefaultAuthTenantId,
    },
    actorUserId: {
      type: "uuid",
      fieldName: "actor_user_id",
      nullable: true,
    },
    action: { type: "varchar", length: 128 },
    resource: { type: "varchar", length: 128 },
    targetUserId: {
      type: "uuid",
      fieldName: "target_user_id",
      nullable: true,
    },
    before: { type: "json", defaultRaw: "'{}'::jsonb" },
    after: { type: "json", defaultRaw: "'{}'::jsonb" },
    metadata: { type: "json", defaultRaw: "'{}'::jsonb" },
    createdAt: {
      type: "timestamptz",
      fieldName: "created_at",
      onCreate: () => new Date(),
    },
  },
  indexes: [
    {
      name: "ix__admin_audit_logs__tenant_id_created_at",
      properties: ["tenantId", "createdAt"],
    },
    {
      name: "ix__admin_audit_logs__tenant_id_action",
      properties: ["tenantId", "action"],
    },
    {
      name: "ix__admin_audit_logs__tenant_id_target_user_id",
      properties: ["tenantId", "targetUserId"],
    },
  ],
});
