import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  NotificationChannel,
  type NotificationTemplateChannelContent,
  NotificationTemplateEngine,
} from '@app/common-notifications';

export interface NotificationTemplateChannelEntityInput {
  templateId: string;
  channel: NotificationChannel;
  engine?: NotificationTemplateEngine;
  content: NotificationTemplateChannelContent;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationTemplateChannelEntity {
  id: string = randomUUID();
  templateId!: string;
  channel!: NotificationChannel;
  engine: NotificationTemplateEngine = NotificationTemplateEngine.StringFormat;
  content!: NotificationTemplateChannelContent;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationTemplateChannelEntityInput) {
    if (input) {
      this.templateId = input.templateId;
      this.channel = input.channel;
      this.engine = input.engine ?? NotificationTemplateEngine.StringFormat;
      this.content = input.content;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

export const NotificationTemplateChannelEntitySchema = new EntitySchema<NotificationTemplateChannelEntity>({
  class: NotificationTemplateChannelEntity,
  tableName: 'notification_template_channels',
  properties: {
    id: { type: 'uuid', primary: true },
    templateId: { type: 'uuid', fieldName: 'template_id' },
    channel: { type: 'varchar', length: 32 },
    engine: { type: 'varchar', length: 50, default: NotificationTemplateEngine.StringFormat },
    content: { type: 'json' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [
    { name: 'uq__notification_template_channels__template_id__channel', properties: ['templateId', 'channel'] },
  ],
});
