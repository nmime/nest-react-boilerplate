import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export interface NotificationTemplateEntityInput {
  code: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationTemplateEntity {
  id: string = randomUUID();
  code!: string;
  description: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationTemplateEntityInput) {
    if (input) {
      this.code = input.code;
      this.description = input.description ?? null;
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
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'uq__notification_templates__code', properties: ['code'] }],
});
