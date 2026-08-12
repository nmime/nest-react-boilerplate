import { randomUUID } from 'node:crypto';
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
  type ClaimPendingNotificationDeliveriesParams,
  type FindRecentNotificationDeliveryErrorsParams,
  type NotificationDeliveryAttemptIdentity,
  type NotificationDeliveryClaim,
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
  NotificationTemplateSource,
  NotificationTemplateStatus,
  type NotificationTemplateChannelRecord,
  type NotificationTemplateRecord,
} from '@app/common-notifications';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';
import {
  EmptyNotificationDeliveryClaimId,
  EmptyNotificationDeliveryTimestamp,
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationTemplateEntity,
  NotificationTemplateVersionChannelEntity,
  NotificationTemplateVersionEntity,
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
        template.name = template.name || params.code;
        template.source = NotificationTemplateSource.Code;
        template.status = NotificationTemplateStatus.Published;
        template.updatedAt = now;
      } else {
        template = new NotificationTemplateEntity({
          code: params.code,
          name: params.code,
          description: params.description,
          source: NotificationTemplateSource.Code,
          status: NotificationTemplateStatus.Published,
          createdAt: now,
          updatedAt: now,
        });
        // The version and channel rows below carry their parents as plain uuid columns rather than
        // as declared relations, so the unit of work has no dependency edge to order the inserts by.
        // Each generation is flushed on its own instead, parent first.
        em.persist(template);
        await em.flush();
      }

      const currentVersion = template.currentVersionId
        ? await em.findOne(NotificationTemplateVersionEntity, { id: template.currentVersionId })
        : null;
      const currentVersionChannels = currentVersion
        ? await em.find(NotificationTemplateVersionChannelEntity, { templateVersionId: currentVersion.id })
        : [];
      const unchanged =
        currentVersion?.publishedAt &&
        normalizedChannels(currentVersionChannels) === normalizedChannels(params.channels);
      let version = currentVersion;
      let versionChannels = currentVersionChannels;
      if (!unchanged) {
        const latest = await em.findOne(
          NotificationTemplateVersionEntity,
          { templateId: template.id },
          { orderBy: { version: 'DESC' } },
        );
        const nextVersion = new NotificationTemplateVersionEntity({
          templateId: template.id,
          version: (latest?.version ?? 0) + 1,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        version = nextVersion;
        versionChannels = params.channels.map(
          (channel) =>
            new NotificationTemplateVersionChannelEntity({
              templateVersionId: nextVersion.id,
              channel: channel.channel,
              engine: channel.engine,
              content: channel.content,
              createdAt: now,
            }),
        );
        // `notification_template_version_channels.template_version_id` and
        // `notification_templates.current_version_id` both reference this row through a scalar
        // column, so it has to be in the table before either of them is written.
        em.persist(version);
        await em.flush();
        template.currentVersionId = version.id;
        em.persist(versionChannels);
      }
      await em.flush();
      return mapTemplate(template, versionChannels, version ?? undefined);
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

  async claimPendingDeliveries<T = NotificationData>(
    params: ClaimPendingNotificationDeliveriesParams,
  ): Promise<NotificationDeliveryClaim<T> | null> {
    // Claim due deliveries atomically before returning them. Selecting with
    // FOR UPDATE SKIP LOCKED (PESSIMISTIC_PARTIAL_WRITE) inside a transaction and
    // stamping `claimedAt` guarantees two workers/replicas never pick the same row,
    // and the `claimedAt <= now - lease` filter lets a row that was claimed but never
    // saved (worker crash) become re-claimable only after the lease expires.
    // saveClaimedDeliveryResults releases the claim once processed.
    const claimableBefore = new Date(params.now.getTime() - DeliveryClaimLeaseSeconds * 1000);
    const claimToken = randomUUID();

    return this.entityManager.transactional(async (em) => {
      const deliveries = await em.find(
        NotificationDeliveryEntity,
        {
          targetType: params.targetType,
          status: NotificationStatus.Pending,
          sendAfter: { $lte: params.now },
          claimedAt: { $lte: claimableBefore },
          dispatchStartedAt: EmptyNotificationDeliveryTimestamp,
          ...(params.targetId ? { targetId: params.targetId } : {}),
        },
        { limit: params.count, orderBy: { priority: 'DESC', id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE },
      );

      if (deliveries.length === 0) {
        return null;
      }

      for (const delivery of deliveries) {
        delivery.claimedAt = params.now;
        delivery.claimToken = claimToken;
      }
      await em.flush();

      const notificationIds = [...new Set(deliveries.map((delivery) => delivery.notificationId))];
      const notifications = await em.find(
        NotificationEntity<T>,
        { id: { $in: notificationIds } },
        { populate: ['template'] },
      );
      const versionIds = [...new Set(notifications.map((notification) => notification.templateVersionId))];
      const versionChannels = await em.find(NotificationTemplateVersionChannelEntity, {
        templateVersionId: { $in: versionIds },
      });
      const versions = await em.find(NotificationTemplateVersionEntity, { id: { $in: versionIds } });
      const notificationsById = new Map(
        notifications.map((notification) => [
          notification.id,
          mapNotification(
            notification,
            versionChannels.filter((channel) => channel.templateVersionId === notification.templateVersionId),
            isEncryptedPayload(notification.sensitiveData)
              ? this.payloadCrypto.decrypt(notification.sensitiveData, payloadAad(notification))
              : null,
            versions.find((version) => version.id === notification.templateVersionId),
          ),
        ]),
      );

      const pendingDeliveries = deliveries.flatMap((delivery) => {
        const notification = notificationsById.get(delivery.notificationId);
        return notification && delivery.claimToken
          ? [{ claimToken: delivery.claimToken, delivery: mapDelivery(delivery), notification }]
          : [];
      });
      return {
        claimToken,
        claimedAt: params.now,
        leaseExpiresAt: new Date(params.now.getTime() + DeliveryClaimLeaseSeconds * 1000),
        deliveries: pendingDeliveries,
      };
    });
  }

  async renewDeliveryClaim(claimToken: string, now: Date): Promise<boolean> {
    const updated = await this.entityManager.nativeUpdate(
      NotificationDeliveryEntity,
      { claimToken, status: NotificationStatus.Pending },
      { claimedAt: now },
    );
    return updated > 0;
  }

  async beginClaimedDeliveryAttempts(
    deliveries: NotificationDeliveryAttemptIdentity[],
    claimToken: string,
    now: Date,
  ): Promise<NotificationDeliveryAttemptIdentity[]> {
    if (deliveries.length === 0) {
      return [];
    }

    return this.entityManager.transactional(async (em) => {
      const started: NotificationDeliveryAttemptIdentity[] = [];
      for (const identity of deliveries) {
        // Claim-token checks and writes are sequenced to keep lock ordering deterministic.
        // eslint-disable-next-line no-await-in-loop
        const delivery = await em.findOne(
          NotificationDeliveryEntity,
          {
            id: identity.id,
            createdAt: identity.createdAt,
            status: NotificationStatus.Pending,
            claimToken,
            dispatchStartedAt: EmptyNotificationDeliveryTimestamp,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!delivery) {
          continue;
        }

        delivery.attempts += 1;
        delivery.dispatchStartedAt = now;
        delivery.updatedAt = now;
        started.push(identity);
      }
      await em.flush();
      return started;
    });
  }

  async saveClaimedDeliveryResults(results: NotificationDeliveryResult[], claimToken: string): Promise<void> {
    if (results.length === 0) {
      return;
    }

    await this.entityManager.transactional(async (em) => {
      for (const result of results) {
        if (result.claimToken !== claimToken) {
          continue;
        }
        // Lock the still-pending token owner so completion and administrative transitions have one database order.
        // eslint-disable-next-line no-await-in-loop
        const delivery = await em.findOne(
          NotificationDeliveryEntity,
          {
            id: result.id,
            createdAt: result.createdAt,
            status: NotificationStatus.Pending,
            claimToken,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!delivery) {
          continue;
        }

        const now = new Date();
        if (delivery.dispatchStartedAt.getTime() === EmptyNotificationDeliveryTimestamp.getTime()) {
          delivery.attempts += 1;
        }
        delivery.status = result.status;
        delivery.error = result.error ?? null;
        delivery.updatedAt = now;
        // Release the claim (reset to the epoch sentinel) so a rescheduled retry is
        // eligible again once its sendAfter passes (terminal rows keep it harmlessly).
        delivery.claimedAt = new Date(0);
        delivery.claimToken = EmptyNotificationDeliveryClaimId;
        delivery.dispatchStartedAt = new Date(EmptyNotificationDeliveryTimestamp.getTime());

        if (result.status === NotificationStatus.Sent) {
          delivery.sentAt = now;
        } else if (result.status === NotificationStatus.Pending) {
          const retryDelaySeconds = Math.min(
            retryMaxDelaySeconds,
            Math.max(result.retryAfterSeconds ?? 0, retryBaseDelaySeconds * 2 ** Math.max(0, delivery.attempts - 1)),
          );
          delivery.sendAfter = new Date(now.getTime() + retryDelaySeconds * 1000);
        }
      }
      await em.flush();
    });
  }

  async countRecentDeliveryErrors(params: FindRecentNotificationDeliveryErrorsParams): Promise<number> {
    const count = await this.entityManager.count(NotificationDeliveryEntity, {
      $or: [
        { status: NotificationStatus.Error, updatedAt: { $gt: params.fromDate } },
        {
          status: NotificationStatus.Pending,
          dispatchStartedAt: { $ne: EmptyNotificationDeliveryTimestamp },
          updatedAt: { $gt: params.fromDate },
        },
      ],
      ...(params.targetType ? { targetType: params.targetType } : {}),
    });
    return Math.min(count, params.limit);
  }

  private async createInTransaction<T>(
    em: EntityManager,
    params: CreateTemplateNotificationParams<T>,
  ): Promise<NotificationRecord<T>> {
    // The deprecated channels field remains a supported wire-compatibility input;
    // all new callers should provide explicit channel/provider deliveries.
    // eslint-disable-next-line sonarjs/deprecation
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

    if (!template.currentVersionId) {
      throw new InvalidNotificationTemplateError(`${template.code} has no published version`);
    }
    const templateVersion = await em.findOne(NotificationTemplateVersionEntity, { id: template.currentVersionId });
    if (!templateVersion?.publishedAt) {
      throw new InvalidNotificationTemplateError(`${template.code} has no published version`);
    }
    const effectiveChannels = await em.find(NotificationTemplateVersionChannelEntity, {
      templateVersionId: templateVersion.id,
    });
    for (const channel of channels) {
      if (!effectiveChannels.some((templateChannel) => templateChannel.channel === channel)) {
        throw new NotificationTemplateChannelNotFoundError(template.code, channel);
      }
    }
    if (
      inAppVisible &&
      !effectiveChannels.some((templateChannel) => templateChannel.channel === NotificationChannel.InApp)
    ) {
      throw new NotificationTemplateChannelNotFoundError(template.code, NotificationChannel.InApp);
    }

    const createdAt = new Date();
    const notification = new NotificationEntity<T>({
      targetType: params.targetType,
      targetId: params.targetId,
      template,
      templateVersionId: templateVersion.id,
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
    return mapNotification(notification, effectiveChannels, null, templateVersion);
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
  if (channel === NotificationChannel.Bot) {
    return NotificationDeliveryProvider.TelegramBot;
  }
  if (channel === NotificationChannel.Email) {
    return NotificationDeliveryProvider.Resend;
  }
  return NotificationDeliveryProvider.GoogleFcm;
}

function mapTemplate(
  template: NotificationTemplateEntity,
  channels: NotificationTemplateVersionChannelEntity[],
  version?: NotificationTemplateVersionEntity,
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
    source: template.source,
    name: template.name,
    status: template.status,
    versionId: version?.id,
    version: version?.version,
    variablesSchema: version?.variablesSchema,
    channels: channelRecords,
  };
}

function mapNotification<T>(
  notification: NotificationEntity<T>,
  channels: NotificationTemplateVersionChannelEntity[],
  sensitiveData: NotificationSensitiveData | null,
  version?: NotificationTemplateVersionEntity,
): NotificationRecord<T> {
  return {
    id: notification.id,
    targetType: notification.targetType,
    targetId: notification.targetId,
    template: mapTemplate(notification.template, channels, version),
    data: notification.data,
    sensitiveData,
    extra: notification.extra,
    inAppVisible: notification.inAppVisible,
    broadcastId: notification.broadcastId,
    templateVersionId: notification.templateVersionId,
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
    broadcastId: delivery.broadcastId,
    priority: delivery.priority,
    sendAfter: delivery.sendAfter,
    sentAt: delivery.sentAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

function normalizedChannels(
  channels: Array<NotificationTemplateVersionChannelEntity | UpsertNotificationTemplateParams['channels'][number]>,
): string {
  return JSON.stringify(
    channels
      .map((channel) => ({
        channel: channel.channel,
        engine: channel.engine ?? NotificationTemplateEngine.StringFormat,
        content: channel.content,
      }))
      .sort((left, right) => left.channel.localeCompare(right.channel)),
  );
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
    typeof value['ciphertext'] === 'string' &&
    typeof value['iv'] === 'string' &&
    typeof value['authTag'] === 'string' &&
    typeof value['keyId'] === 'string'
  );
}
