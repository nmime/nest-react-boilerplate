import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from './auth-user.entity';

export const AdminAuditActions = [
  'admin.access',
  'admin.role.create',
  'admin.role.update',
  'admin.role.permissions.update',
  'admin.user.status.update',
  'admin.user.access_policy.update',
  'admin.user.roles.update',
  'admin.problem_presentation.update',
  'admin.problem_presentation.reset',
  'admin.notification_template.create',
  'admin.notification_template.update',
  'admin.notification_template.publish',
  'admin.notification_template.archive',
  'admin.notification_template.test_send',
  'admin.notification_segment.create',
  'admin.notification_segment.update',
  'admin.notification_segment.upload',
  'admin.notification_segment.archive',
  'admin.notification_broadcast.create',
  'admin.notification_broadcast.update',
  'admin.notification_broadcast.command',
  'admin.feature_flag.upsert',
] as const;

export type AdminAuditAction = (typeof AdminAuditActions)[number];

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
  actorUserId: string | null = null;
  action!: string;
  resource!: string;
  targetUserId: string | null = null;
  before: Record<string, unknown> = {};
  after: Record<string, unknown> = {};
  metadata: Record<string, unknown> = {};
  createdAt: Date = new Date();

  constructor(input?: AdminAuditLogEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.actorUserId = input.actorUserId ?? null;
      this.action = input.action;
      this.resource = input.resource;
      this.targetUserId = input.targetUserId ?? null;
      this.before = input.before ?? {};
      this.after = input.after ?? {};
      this.metadata = input.metadata ?? {};
      this.createdAt = input.createdAt ?? new Date();
    }
  }
}

export const AdminAuditLogEntitySchema = new EntitySchema<AdminAuditLogEntity>({
  class: AdminAuditLogEntity,
  tableName: 'admin_audit_logs',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    actorUserId: {
      type: 'uuid',
      fieldName: 'actor_user_id',
      nullable: true,
    },
    action: { type: 'varchar', length: 128 },
    resource: { type: 'varchar', length: 128 },
    targetUserId: {
      type: 'uuid',
      fieldName: 'target_user_id',
      nullable: true,
    },
    before: { type: 'json', defaultRaw: "'{}'::jsonb" },
    after: { type: 'json', defaultRaw: "'{}'::jsonb" },
    metadata: { type: 'json', defaultRaw: "'{}'::jsonb" },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    {
      name: 'ix__admin_audit_logs__tenant_id_created_at',
      properties: ['tenantId', 'createdAt'],
    },
    {
      name: 'ix__admin_audit_logs__tenant_id_action',
      properties: ['tenantId', 'action'],
    },
    {
      name: 'ix__admin_audit_logs__tenant_id_target_user_id',
      properties: ['tenantId', 'targetUserId'],
    },
    {
      name: 'ix__admin_audit_logs__tenant_id_resource_created_at',
      properties: ['tenantId', 'resource', 'createdAt'],
    },
    {
      name: 'ix__admin_audit_logs__tenant_id_actor_user_id_created_at',
      properties: ['tenantId', 'actorUserId', 'createdAt'],
    },
  ],
});
