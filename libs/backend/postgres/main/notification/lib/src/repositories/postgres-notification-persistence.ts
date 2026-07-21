import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  EmptyNotificationAudienceError,
  InvalidNotificationTemplateError,
  NotificationPersistence,
  NotificationTemplateChannelNotFoundError,
  NotificationTemplateNotFoundError,
  type CreateTemplateNotificationBatch,
  type CreateTemplateNotificationParams,
  type FindPendingNotificationDeliveriesParams,
  type FindRecentNotificationDeliveryErrorsParams,
  type NotificationDeliveryRoute,
  type UpsertNotificationTemplateParams,
} from '@app/backend-feature-notification-shared';
import {
  NotificationChannel,
  isNotificationTemplateChannelContent,
  type NotificationData,
  type NotificationDeliveryChannel,
  NotificationDeliveryProvider,
  type NotificationDeliveryRecord,
  type NotificationDeliveryResult,
  NotificationPriority,
  type NotificationRecord,
  type NotificationSensitiveData,
  NotificationStatus,
  NotificationTemplateEngine,
  type NotificationTemplateChannelRecord,
  type NotificationTemplateRecord,
  type PendingNotificationDelivery,
} from '@app/common-notifications';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';
import {
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationTemplateChannelEntity,
  NotificationTemplateEntity,
} from '../infrastructure/data-access/entities';

const defaultDeliveryChannels: NotificationDeliveryChannel[] = [NotificationChannel.Bot];
const retryBaseDelaySeconds = 30;
const retryMaxDelaySeconds = 30 * 60;

// A claimed delivery is re-claimable only after this lease elapses, so a worker
// that crashes between claiming and saving results cannot strand the row, while a
// second worker/replica still cannot re-send within the lease window.
export const DeliveryClaimLeaseSeconds = 5 * 60;

@Injectable()
export class PostgresNotificationPersistence extends NotificationPersistence {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
    private readonly payloadCrypto: NotificationPayloadCryptoService,
  ) {
    super();
  }

  async upsertTemplate(params: UpsertNotificationTemplateParams): Promise<NotificationTemplateRecord> {
    const channelNames = params.channels.map((channel) => channel.channel);
    if (channelNames.length === 0) {
      throw new InvalidNotificationTemplateError('at least one channel is required');
    }
    if (new Set(channelNames).size !== channelNames.length) {
      throw new InvalidNotificationTemplateError('channel names must be unique');
    }
    const invalidChannel = params.channels.find(
      (channel) => !isNotificationTemplateChannelContent(channel.channel, channel.content),
    );
    if (invalidChannel) {
      throw new InvalidNotificationTemplateError(`invalid ${invalidChannel.channel} channel content`);
    }

    return this.entityManager.transactional(async (em) => {
      const now = new Date();
      let template = await em.findOne(NotificationTemplateEntity, { code: params.code });
      if (template) {
        template.description = params.description ?? null;
        template.updatedAt = now;
      } else {
        template = new NotificationTemplateEntity({
          code: params.code,
          description: params.description,
          createdAt: now,
          updatedAt: now,
        });
        em.persist(template);
      }

      const existingChannels = await em.find(NotificationTemplateChannelEntity, { templateId: template.id });
      const requestedChannels = new Set(params.channels.map((channel) => channel.channel));
      const channels = params.channels.map((paramsChannel) => {
        const existing = existingChannels.find((channel) => channel.channel === paramsChannel.channel);
        if (existing) {
          existing.engine = paramsChannel.engine ?? NotificationTemplateEngine.StringFormat;
          existing.content = paramsChannel.content;
          existing.updatedAt = now;
          return existing;
        }
        return new NotificationTemplateChannelEntity({
          templateId: template.id,
          channel: paramsChannel.channel,
          engine: paramsChannel.engine,
          content: paramsChannel.content,
          createdAt: now,
          updatedAt: now,
        });
      });
      const removedChannels = existingChannels.filter((channel) => !requestedChannels.has(channel.channel));
      em.persist(channels);
      em.remove(removedChannels);
      await em.flush();
      return mapTemplate(template, channels);
    });
  }

  async create<T>(params: CreateTemplateNotificationParams<T>): Promise<NotificationRecord<T>> {
    return this.entityManager.transactional((em) => this.createInTransaction(em, params));
  }

  async createBatch<T>(params: CreateTemplateNotificationBatch<T>): Promise<NotificationRecord<T>[]> {
    if (params.items.length === 0) {
      return [];
    }

    return this.entityManager.transactional(async (em) => {
      const records: NotificationRecord<T>[] = [];
      for (const item of params.items) {
        // A single MikroORM EntityManager transaction must sequence unit-of-work mutations.
        // eslint-disable-next-line no-await-in-loop
        const record = await this.createInTransaction(em, {
          targetType: params.targetType,
          targetId: item.targetId,
          templateCode: item.templateCode,
          deliveries: item.deliveries ?? params.deliveries,
          channels: item.channels ?? params.channels,
          inAppVisible: item.inAppVisible ?? params.inAppVisible,
          priority: item.priority ?? params.priority,
          sendAfter: item.sendAfter ?? params.sendAfter,
          data: item.data,
          sensitiveData: item.sensitiveData,
          extra: item.extra,
        });
        records.push(record);
      }
      return records;
    });
  }

  async findPendingDeliveries<T = NotificationData>(
    params: FindPendingNotificationDeliveriesParams,
  ): Promise<PendingNotificationDelivery<T>[]> {
    // Claim due deliveries atomically before returning them. Selecting with
    // FOR UPDATE SKIP LOCKED (PESSIMISTIC_PARTIAL_WRITE) inside a transaction and
    // stamping `claimedAt` guarantees two workers/replicas never pick the same row,
    // and the `claimedAt <= now - lease` filter lets a row that was claimed but never
    // saved (worker crash) become re-claimable only after the lease expires.
    // saveDeliveryResults releases the claim (resets claimedAt) once processed.
    const claimableBefore = new Date(params.now.getTime() - DeliveryClaimLeaseSeconds * 1000);

    return this.entityManager.transactional(async (em) => {
      const deliveries = await em.find(
        NotificationDeliveryEntity,
        {
          targetType: params.targetType,
          status: NotificationStatus.Pending,
          sendAfter: { $lte: params.now },
          claimedAt: { $lte: claimableBefore },
          ...(params.targetId ? { targetId: params.targetId } : {}),
        },
        { limit: params.count, orderBy: { priority: 'DESC', id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE },
      );

      if (deliveries.length === 0) {
        return [];
      }

      for (const delivery of deliveries) {
        delivery.claimedAt = params.now;
      }
      await em.flush();

      const notificationIds = [...new Set(deliveries.map((delivery) => delivery.notificationId))];
      const notifications = await em.find(
        NotificationEntity<T>,
        { id: { $in: notificationIds } },
        { populate: ['template'] },
      );
      const templateIds = [...new Set(notifications.map((notification) => notification.template.id))];
      const templateChannels = await em.find(NotificationTemplateChannelEntity, {
        templateId: { $in: templateIds },
      });

      const channelsByTemplateId = groupTemplateChannels(templateChannels);
      const notificationsById = new Map(
        notifications.map((notification) => [
          notification.id,
          mapNotification(
            notification,
            channelsByTemplateId.get(notification.template.id) ?? [],
            isEncryptedPayload(notification.sensitiveData)
              ? this.payloadCrypto.decrypt(notification.sensitiveData, payloadAad(notification))
              : null,
          ),
        ]),
      );

      return deliveries.flatMap((delivery) => {
        const notification = notificationsById.get(delivery.notificationId);
        return notification ? [{ delivery: mapDelivery(delivery), notification }] : [];
      });
    });
  }

  async saveDeliveryResults(results: NotificationDeliveryResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    await this.entityManager.transactional(async (em) => {
      for (const result of results) {
        // Result rows are updated through one transactional EntityManager in deterministic order.
        // eslint-disable-next-line no-await-in-loop
        const delivery = await em.findOne(NotificationDeliveryEntity, {
          id: result.id,
          createdAt: result.createdAt,
        });
        if (!delivery) {
          continue;
        }

        delivery.attempts += 1;
        delivery.status = result.status;
        delivery.error = result.error ?? null;
        delivery.updatedAt = new Date();
        // Release the claim (reset to the epoch sentinel) so a rescheduled retry is
        // eligible again once its sendAfter passes (terminal rows keep it harmlessly).
        delivery.claimedAt = new Date(0);

        if (result.status === NotificationStatus.Sent) {
          delivery.sentAt = delivery.updatedAt;
        } else if (result.status === NotificationStatus.Pending) {
          const retryDelaySeconds = Math.min(
            retryMaxDelaySeconds,
            retryBaseDelaySeconds * 2 ** Math.max(0, delivery.attempts - 1),
          );
          delivery.sendAfter = new Date(delivery.updatedAt.getTime() + retryDelaySeconds * 1000);
        }
      }
      await em.flush();
    });
  }

  async countRecentDeliveryErrors(params: FindRecentNotificationDeliveryErrorsParams): Promise<number> {
    const count = await this.entityManager.count(NotificationDeliveryEntity, {
      status: NotificationStatus.Error,
      updatedAt: { $gt: params.fromDate },
      ...(params.targetType ? { targetType: params.targetType } : {}),
    });
    return Math.min(count, params.limit);
  }

  private async createInTransaction<T>(
    em: EntityManager,
    params: CreateTemplateNotificationParams<T>,
  ): Promise<NotificationRecord<T>> {
    const routes = resolveRoutes(params.deliveries, params.channels);
    const channels = routes.map((route) => route.channel);
    const inAppVisible = params.inAppVisible ?? true;
    if (channels.length === 0 && !inAppVisible) {
      throw new EmptyNotificationAudienceError();
    }

    const template = await em.findOne(NotificationTemplateEntity, { code: params.templateCode });
    if (!template) {
      throw new NotificationTemplateNotFoundError(params.templateCode);
    }

    const templateChannels = await em.find(NotificationTemplateChannelEntity, { templateId: template.id });
    for (const channel of channels) {
      if (!templateChannels.some((templateChannel) => templateChannel.channel === channel)) {
        throw new NotificationTemplateChannelNotFoundError(template.code, channel);
      }
    }
    if (
      inAppVisible &&
      !templateChannels.some((templateChannel) => templateChannel.channel === NotificationChannel.InApp)
    ) {
      throw new NotificationTemplateChannelNotFoundError(template.code, NotificationChannel.InApp);
    }

    const createdAt = new Date();
    const notification = new NotificationEntity<T>({
      targetType: params.targetType,
      targetId: params.targetId,
      template,
      data: params.data,
      extra: params.extra,
      inAppVisible,
      createdAt,
    });
    if (params.sensitiveData) {
      notification.sensitiveData = this.payloadCrypto.encrypt(params.sensitiveData, payloadAad(notification));
    }
    const deliveries = routes.map(
      (route) =>
        new NotificationDeliveryEntity({
          notificationId: notification.id,
          targetType: params.targetType,
          targetId: params.targetId,
          channel: route.channel,
          status: NotificationStatus.Pending,
          provider: route.provider,
          priority: params.priority ?? NotificationPriority.Default,
          sendAfter: params.sendAfter ?? createdAt,
          createdAt,
          updatedAt: createdAt,
        }),
    );

    em.persist([notification, ...deliveries]);
    await em.flush();
    return mapNotification(notification, templateChannels, null);
  }
}

function resolveRoutes(
  deliveries: NotificationDeliveryRoute[] | undefined,
  channels: NotificationDeliveryChannel[] | undefined,
): NotificationDeliveryRoute[] {
  const requested =
    deliveries ??
    (channels ?? defaultDeliveryChannels).map((channel) => ({
      channel,
      provider: defaultProvider(channel),
    }));
  const byChannel = new Map<NotificationDeliveryChannel, NotificationDeliveryRoute>();
  for (const route of requested) {
    if (!isProviderCompatible(route)) {
      throw new InvalidNotificationTemplateError(`${route.provider} cannot deliver the ${route.channel} channel`);
    }
    const existing = byChannel.get(route.channel);
    if (existing && existing.provider !== route.provider) {
      throw new InvalidNotificationTemplateError(`only one provider can be selected for ${route.channel}`);
    }
    byChannel.set(route.channel, route);
  }
  return [...byChannel.values()];
}

function isProviderCompatible(route: NotificationDeliveryRoute): boolean {
  if (route.channel === NotificationChannel.Bot) {
    return (
      route.provider === NotificationDeliveryProvider.TelegramBot ||
      route.provider === NotificationDeliveryProvider.DiscordBot
    );
  }
  if (route.channel === NotificationChannel.Email) {
    return (
      route.provider === NotificationDeliveryProvider.Resend || route.provider === NotificationDeliveryProvider.MailPace
    );
  }
  return (
    route.provider === NotificationDeliveryProvider.GoogleFcm ||
    route.provider === NotificationDeliveryProvider.AppleApns
  );
}

function defaultProvider(channel: NotificationDeliveryChannel): NotificationDeliveryProvider {
  if (channel === NotificationChannel.Bot) return NotificationDeliveryProvider.TelegramBot;
  if (channel === NotificationChannel.Email) return NotificationDeliveryProvider.Resend;
  return NotificationDeliveryProvider.GoogleFcm;
}

function groupTemplateChannels(
  channels: NotificationTemplateChannelEntity[],
): Map<string, NotificationTemplateChannelEntity[]> {
  const result = new Map<string, NotificationTemplateChannelEntity[]>();
  for (const channel of channels) {
    result.set(channel.templateId, [...(result.get(channel.templateId) ?? []), channel]);
  }
  return result;
}

function mapTemplate(
  template: NotificationTemplateEntity,
  channels: NotificationTemplateChannelEntity[],
): NotificationTemplateRecord {
  const channelRecords: Partial<Record<NotificationChannel, NotificationTemplateChannelRecord>> = {};
  for (const channel of channels) {
    channelRecords[channel.channel] = {
      id: channel.id,
      channel: channel.channel,
      engine: channel.engine,
      content: channel.content,
    };
  }
  return {
    id: template.id,
    code: template.code,
    description: template.description,
    channels: channelRecords,
  };
}

function mapNotification<T>(
  notification: NotificationEntity<T>,
  channels: NotificationTemplateChannelEntity[],
  sensitiveData: NotificationSensitiveData | null,
): NotificationRecord<T> {
  return {
    id: notification.id,
    targetType: notification.targetType,
    targetId: notification.targetId,
    template: mapTemplate(notification.template, channels),
    data: notification.data,
    sensitiveData,
    extra: notification.extra,
    inAppVisible: notification.inAppVisible,
    createdAt: notification.createdAt,
  };
}

function mapDelivery(delivery: NotificationDeliveryEntity): NotificationDeliveryRecord {
  return {
    id: delivery.id,
    notificationId: delivery.notificationId,
    targetType: delivery.targetType,
    targetId: delivery.targetId,
    channel: delivery.channel,
    status: delivery.status,
    error: delivery.error,
    attempts: delivery.attempts,
    provider: delivery.provider,
    priority: delivery.priority,
    sendAfter: delivery.sendAfter,
    sentAt: delivery.sentAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

function payloadAad<T>(notification: NotificationEntity<T>): string {
  return `notification:${notification.id}:${notification.targetType}:${notification.targetId}`;
}

function isEncryptedPayload(value: NotificationEntity['sensitiveData']): value is {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value['ciphertext'] === 'string' &&
    typeof value['iv'] === 'string' &&
    typeof value['authTag'] === 'string' &&
    typeof value['keyId'] === 'string'
  );
}
