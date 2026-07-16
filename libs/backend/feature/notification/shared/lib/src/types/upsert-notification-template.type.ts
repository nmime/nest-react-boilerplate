import type {
  NotificationChannel,
  NotificationTemplateChannelContent,
  NotificationTemplateEngine,
} from '@app/common-notifications';

export interface UpsertNotificationTemplateChannel {
  channel: NotificationChannel;
  engine?: NotificationTemplateEngine;
  content: NotificationTemplateChannelContent;
}

export interface UpsertNotificationTemplateParams {
  code: string;
  description?: string;
  channels: UpsertNotificationTemplateChannel[];
}
