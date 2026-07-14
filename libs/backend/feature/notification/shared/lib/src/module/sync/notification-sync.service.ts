import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryRepository,
  NotificationEntity,
  NotificationPriority,
  NotificationRepository,
  NotificationStatus,
  NotificationTemplateEntity,
  NotificationTemplateRepository,
} from '@app/backend-postgres-main-notification';
import { NotificationService } from '../../notification-service';
import type { CreateTemplateNotificationParams, CreateTemplateNotificationBatch } from '../../types';

@Injectable()
export class NotificationSyncService extends NotificationService {
  private readonly logger = new Logger(NotificationSyncService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationTemplateRepository: NotificationTemplateRepository,
    private readonly notificationDeliveryRepository: NotificationDeliveryRepository,
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {
    super();
  }

  async createTemplateNotification<T>(
    params: CreateTemplateNotificationParams<T>,
  ): Promise<NotificationEntity<T> | undefined> {
    const { channel, targetType, targetId, templateCode, data, extra, priority } = params;

    const notificationTemplate = await this.notificationTemplateRepository.findOneByCode(templateCode);

    if (!notificationTemplate) {
      this.logger.warn(`Notification template not found: ${templateCode}`);
      return;
    }

    const entity = new NotificationEntity<T>({
      channel,
      targetType,
      targetId,
      status: NotificationStatus.Pending,
      template: notificationTemplate,
      data,
      extra,
      priority: priority ?? NotificationPriority.Default,
    });

    await this.entityManager.transactional(async (em) => {
      em.persist(entity);
      await em.flush();

      if (channel === NotificationChannel.Bot && entity.id) {
        await this.notificationDeliveryRepository.createBotDeliveriesForNotificationIds([entity.id]);
      }
    });

    return entity;
  }

  async createTemplateNotificationsBatch<T>(params: CreateTemplateNotificationBatch<T>): Promise<void> {
    const { channel, targetType, items } = params;

    if (!items.length) {
      return;
    }

    const templateCodes = [...new Set(items.map((item) => item.templateCode))];

    const templates = await Promise.all(
      templateCodes.map((code) => this.notificationTemplateRepository.findOneByCode(code)),
    );
    const existingTemplates = templates.filter(Boolean) as NotificationTemplateEntity[];

    if (!existingTemplates.length) {
      this.logger.warn('No notification templates found for batch');
      return;
    }

    const codeToTemplate = existingTemplates.reduce<Record<string, NotificationTemplateEntity>>(
      (acc, template) => ({ ...acc, [template.code]: template }),
      {},
    );

    const notifications: NotificationEntity<T>[] = [];
    for (const item of items) {
      const template = codeToTemplate[item.templateCode];
      if (!template) {
        continue;
      }
      notifications.push(
        new NotificationEntity<T>({
          channel,
          targetType,
          targetId: item.targetId,
          status: NotificationStatus.Pending,
          template,
          data: item.data,
          extra: item.extra,
          priority: item.priority ?? NotificationPriority.Default,
        }),
      );
    }

    if (!notifications.length) {
      return;
    }

    await this.entityManager.transactional(async (em) => {
      em.persist(notifications);
      await em.flush();

      if (channel === NotificationChannel.Bot) {
        const ids = notifications.map((n) => n.id);
        await this.notificationDeliveryRepository.createBotDeliveriesForNotificationIds(ids);
      }
    });

    this.logger.log(`Created ${notifications.length} notifications in batch`);
  }
}
