import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { NotificationTemplateEngine } from '../../domain';

export interface NotificationTemplateEntityInput {
  code: string;
  description?: string | null;
  body?: Record<string, string> | null;
  image?: Record<string, string> | null;
  buttons?: Record<string, unknown> | null;
  templateEngine?: NotificationTemplateEngine;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationTemplateEntity {
  id: string = randomUUID();
  code!: string;
  description: string | null = null;
  body: Record<string, string> | null = null;
  image: Record<string, string> | null = null;
  buttons: Record<string, unknown> | null = null;
  templateEngine: NotificationTemplateEngine = NotificationTemplateEngine.StringFormat;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  // Lazy relations set by MikroORM
  botChannel?: NotificationTemplateChannelEntity | null;

  constructor(input?: NotificationTemplateEntityInput) {
    if (input) {
      this.code = input.code;
      this.description = input.description ?? null;
      this.body = input.body ?? null;
      this.image = input.image ?? null;
      this.buttons = input.buttons ?? null;
      this.templateEngine = input.templateEngine ?? NotificationTemplateEngine.StringFormat;
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
    body: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    image: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    buttons: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    templateEngine: { type: 'varchar', length: 50, fieldName: 'template_engine', default: NotificationTemplateEngine.StringFormat },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'uq__notification_templates__code', properties: ['code'] }],
});
