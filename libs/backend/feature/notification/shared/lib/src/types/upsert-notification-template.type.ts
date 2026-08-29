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
  /**
   * Omitted only by trusted internal publishers that install a shared code-owned template.
   * Authenticated HTTP callers always pass the principal tenant.
   */
  tenantId?: string;
  code: string;
  description?: string;
  channels: UpsertNotificationTemplateChannel[];
}
