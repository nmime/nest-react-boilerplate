import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { NotificationTemplateSource, NotificationTemplateStatus } from '@app/common-notifications';

export interface NotificationTemplateEntityInput {
  code: string;
  description?: string | null;
  tenantId?: string | null;
  name?: string;
  source?: NotificationTemplateSource;
  status?: NotificationTemplateStatus;
  currentVersionId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationTemplateEntity {
  id: string = randomUUID();
  code!: string;
  description: string | null = null;
  tenantId: string | null = null;
  name = '';
  source: NotificationTemplateSource = NotificationTemplateSource.Code;
  status: NotificationTemplateStatus = NotificationTemplateStatus.Published;
  currentVersionId: string | null = null;
  createdBy: string | null = null;
  updatedBy: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationTemplateEntityInput) {
    if (input) {
      this.code = input.code;
      this.description = input.description ?? null;
      this.tenantId = input.tenantId ?? null;
      this.name = input.name ?? input.code;
      this.source = input.source ?? NotificationTemplateSource.Code;
      this.status = input.status ?? NotificationTemplateStatus.Published;
      this.currentVersionId = input.currentVersionId ?? null;
      this.createdBy = input.createdBy ?? null;
      this.updatedBy = input.updatedBy ?? null;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

export const NotificationTemplateEntitySchema = new EntitySchema<NotificationTemplateEntity>({
  class: NotificationTemplateEntity,
  tableName: 'notification_templates',
  properties: {
    id: { type: 'uuid', primary: true },
    code: { type: 'varchar', length: 128 },
    description: { type: 'text', nullable: true, default: null },
    tenantId: { type: 'uuid', fieldName: 'tenant_id', nullable: true, default: null },
    name: { type: 'varchar', length: 160 },
    source: { type: 'varchar', length: 16, default: NotificationTemplateSource.Code },
    status: { type: 'varchar', length: 16, default: NotificationTemplateStatus.Published },
    currentVersionId: { type: 'uuid', fieldName: 'current_version_id', nullable: true, default: null },
    createdBy: { type: 'varchar', fieldName: 'created_by', length: 160, nullable: true, default: null },
    updatedBy: { type: 'varchar', fieldName: 'updated_by', length: 160, nullable: true, default: null },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'uq__notification_templates__code', properties: ['code'] }],
});
