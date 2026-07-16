import { Injectable } from '@nestjs/common';
import {
  NotificationPersistence,
  NotificationService,
  type CreateTemplateNotificationBatch,
  type CreateTemplateNotificationParams,
  type UpsertNotificationTemplateParams,
} from '@app/backend-feature-notification-shared';
import type { NotificationRecord, NotificationTemplateRecord } from '@app/common-notifications';

@Injectable()
export class NotificationApplicationService extends NotificationService {
  constructor(private readonly notificationPersistence: NotificationPersistence) {
    super();
  }

  upsertTemplate(params: UpsertNotificationTemplateParams): Promise<NotificationTemplateRecord> {
    return this.notificationPersistence.upsertTemplate(params);
  }

  createTemplateNotification<T>(params: CreateTemplateNotificationParams<T>): Promise<NotificationRecord<T>> {
    return this.notificationPersistence.create(params);
  }

  createTemplateNotificationsBatch<T>(params: CreateTemplateNotificationBatch<T>): Promise<NotificationRecord<T>[]> {
    return this.notificationPersistence.createBatch(params);
  }
}
