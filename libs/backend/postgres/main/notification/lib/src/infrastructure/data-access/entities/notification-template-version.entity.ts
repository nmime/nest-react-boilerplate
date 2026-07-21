import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { NotificationVariablesSchema } from '@app/common-notifications';

export interface NotificationTemplateVersionEntityInput {
  templateId: string;
  version: number;
  variablesSchema?: NotificationVariablesSchema;
  publishedAt?: Date | null;
  publishedBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationTemplateVersionEntity {
  id: string = randomUUID();
  templateId!: string;
  version!: number;
  variablesSchema: NotificationVariablesSchema = {};
  publishedAt: Date | null = null;
  publishedBy: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationTemplateVersionEntityInput) {
    if (input) {
      this.templateId = input.templateId;
      this.version = input.version;
      this.variablesSchema = input.variablesSchema ?? {};
      this.publishedAt = input.publishedAt ?? null;
      this.publishedBy = input.publishedBy ?? null;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

export const NotificationTemplateVersionEntitySchema = new EntitySchema<NotificationTemplateVersionEntity>({
  class: NotificationTemplateVersionEntity,
  tableName: 'notification_template_versions',
  properties: {
    id: { type: 'uuid', primary: true },
    templateId: { type: 'uuid', fieldName: 'template_id' },
    version: { type: 'integer' },
    variablesSchema: { type: 'json', fieldName: 'variables_schema', defaultRaw: "'{}'::jsonb" },
    publishedAt: { type: 'timestamptz', fieldName: 'published_at', nullable: true, default: null },
    publishedBy: { type: 'varchar', fieldName: 'published_by', length: 160, nullable: true, default: null },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [
    { name: 'uq__notification_template_versions__template_id__version', properties: ['templateId', 'version'] },
  ],
  indexes: [{ name: 'ix__notification_template_versions__template_id', properties: ['templateId'] }],
});
