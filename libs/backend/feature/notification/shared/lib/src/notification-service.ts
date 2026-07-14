import type { NotificationEntity } from '@app/backend-postgres-main-notification';
import type { CreateTemplateNotificationParams, CreateTemplateNotificationBatch } from './types';

export abstract class NotificationService {
  abstract createTemplateNotification<T>(
    params: CreateTemplateNotificationParams<T>,
  ): Promise<NotificationEntity<T> | undefined>;

  abstract createTemplateNotificationsBatch<T>(params: CreateTemplateNotificationBatch<T>): Promise<void>;
}
