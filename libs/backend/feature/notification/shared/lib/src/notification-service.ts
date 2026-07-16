import type { NotificationRecord, NotificationTemplateRecord } from '@app/common-notifications';
import type {
  CreateTemplateNotificationParams,
  CreateTemplateNotificationBatch,
  UpsertNotificationTemplateParams,
} from './types';

export abstract class NotificationService {
  abstract upsertTemplate(params: UpsertNotificationTemplateParams): Promise<NotificationTemplateRecord>;

  abstract createTemplateNotification<T>(params: CreateTemplateNotificationParams<T>): Promise<NotificationRecord<T>>;

  abstract createTemplateNotificationsBatch<T>(
    params: CreateTemplateNotificationBatch<T>,
  ): Promise<NotificationRecord<T>[]>;
}
