import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  NotificationChannel,
  type NotificationTemplateChannelContent,
  NotificationTemplateEngine,
} from '@app/common-notifications';

export interface NotificationTemplateVersionChannelEntityInput {
  templateVersionId: string;
  channel: NotificationChannel;
  engine?: NotificationTemplateEngine;
  content: NotificationTemplateChannelContent;
  createdAt?: Date;
}

export class NotificationTemplateVersionChannelEntity {
  id: string = randomUUID();
  templateVersionId!: string;
  channel!: NotificationChannel;
  engine: NotificationTemplateEngine = NotificationTemplateEngine.StringFormat;
  content!: NotificationTemplateChannelContent;
  createdAt: Date = new Date();

  constructor(input?: NotificationTemplateVersionChannelEntityInput) {
    if (input) {
      this.templateVersionId = input.templateVersionId;
      this.channel = input.channel;
      this.engine = input.engine ?? NotificationTemplateEngine.StringFormat;
      this.content = input.content;
      this.createdAt = input.createdAt ?? new Date();
    }
  }
}

export const NotificationTemplateVersionChannelEntitySchema =
  new EntitySchema<NotificationTemplateVersionChannelEntity>({
    class: NotificationTemplateVersionChannelEntity,
    tableName: 'notification_template_version_channels',
    properties: {
      id: { type: 'uuid', primary: true },
      templateVersionId: { type: 'uuid', fieldName: 'template_version_id' },
      channel: { type: 'varchar', length: 32 },
      engine: { type: 'varchar', length: 50, default: NotificationTemplateEngine.StringFormat },
      content: { type: 'json' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    },
    uniques: [
      {
        name: 'uq__notification_template_version_channels__version__channel',
        properties: ['templateVersionId', 'channel'],
      },
    ],
    indexes: [
      { name: 'ix__notification_template_version_channels__template_version_id', properties: ['templateVersionId'] },
    ],
  });
