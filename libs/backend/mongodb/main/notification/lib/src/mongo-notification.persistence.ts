import { randomUUID } from 'node:crypto';
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
  NotificationDeliveryProvider,
  NotificationPriority,
  NotificationStatus,
  NotificationTemplateEngine,
  NotificationTemplateSource,
  NotificationTemplateStatus,
  isNotificationTemplateChannelContent,
  type NotificationData,
  type NotificationDeliveryChannel,
  type NotificationDeliveryRecord,
  type NotificationDeliveryResult,
  type NotificationRecord,
  type NotificationTemplateChannelRecord,
  type NotificationTemplateRecord,
  type PendingNotificationDelivery,
} from '@app/common-notifications';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';
import {
  NotificationMongoCollections,
  type NotificationDeliveryDocument,
  type NotificationDocument,
  type NotificationTemplateDocument,
  type NotificationTemplateVersionChannelDocument,
  type NotificationTemplateVersionDocument,
  isEncryptedNotificationPayload,
} from './notification-mongo.documents';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';

const defaultDeliveryChannels: NotificationDeliveryChannel[] = [NotificationChannel.Bot];
const retryBaseDelaySeconds = 30;
const retryMaxDelaySeconds = 30 * 60;
export const MongoNotificationClaimLeaseMs = 5 * 60 * 1000;

@Injectable()
export class MongoNotificationPersistence extends NotificationPersistence {
  private readonly templates: Collection<NotificationTemplateDocument>;
  private readonly versions: Collection<NotificationTemplateVersionDocument>;
  private readonly channels: Collection<NotificationTemplateVersionChannelDocument>;
  private readonly notifications: Collection<NotificationDocument>;
  private readonly deliveries: Collection<NotificationDeliveryDocument>;

  constructor(
    @Inject(MongoDatabaseToken) database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
    private readonly payloadCrypto: NotificationMongoPayloadCryptoService,
  ) {
    super();
    this.templates = database.collection(NotificationMongoCollections.templates);
    this.versions = database.collection(NotificationMongoCollections.templateVersions);
    this.channels = database.collection(NotificationMongoCollections.templateVersionChannels);
    this.notifications = database.collection(NotificationMongoCollections.notifications);
    this.deliveries = database.collection(NotificationMongoCollections.deliveries);
  }

  async upsertTemplate(params: UpsertNotificationTemplateParams): Promise<NotificationTemplateRecord> {
    validateTemplateChannels(params.channels);
    return runInMongoTransaction(this.client, async (session) => {
      const now = new Date();
      let template = await this.templates.findOne({ code: params.code }, { session });
      if (!template) {
        template = {
          _id: randomUUID(),
          tenantId: null,
          code: params.code,
          name: params.code,
          description: params.description ?? null,
          source: NotificationTemplateSource.Code,
          status: NotificationTemplateStatus.Published,
          currentVersionId: null,
          createdBy: null,
          updatedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        await this.templates.insertOne(template, { session });
      }

      const currentVersion = template.currentVersionId
        ? await this.versions.findOne({ _id: template.currentVersionId }, { session })
        : null;
      const currentChannels = currentVersion
        ? await this.channels.find({ templateVersionId: currentVersion._id }, { session }).toArray()
        : [];
      const unchanged =
        currentVersion?.publishedAt !== null &&
        normalizedChannels(currentChannels) === normalizedChannels(params.channels);
      let version = currentVersion;
      let versionChannels = currentChannels;
      if (!unchanged) {
        const latest = await this.versions
          .find({ templateId: template._id }, { session })
          .sort({ version: -1 })
          .limit(1)
          .next();
        version = {
          _id: randomUUID(),
          templateId: template._id,
          version: (latest?.version ?? 0) + 1,
          variablesSchema: {},
          publishedAt: now,
          publishedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        versionChannels = params.channels.map((item) => ({
          _id: randomUUID(),
          templateVersionId: version?._id ?? '',
          channel: item.channel,
          engine: item.engine ?? NotificationTemplateEngine.StringFormat,
          content: item.content,
          createdAt: now,
        }));
        await this.versions.insertOne(version, { session });
        await this.channels.insertMany(versionChannels, { session });
      }
      const currentVersionId = version?._id ?? null;
      await this.templates.updateOne(
        { _id: template._id },
        {
          $set: {
            description: params.description ?? null,
            name: template.name || params.code,
            source: NotificationTemplateSource.Code,
            status: NotificationTemplateStatus.Published,
            currentVersionId,
            updatedAt: now,
          },
        },
        { session },
      );
      return mapTemplate(
        { ...template, description: params.description ?? null, currentVersionId, updatedAt: now },
        versionChannels,
        version,
      );
    });
  }

  create<T>(params: CreateTemplateNotificationParams<T>): Promise<NotificationRecord<T>> {
    return runInMongoTransaction(this.client, (session) => this.createInTransaction(params, session));
  }

  async createBatch<T>(params: CreateTemplateNotificationBatch<T>): Promise<NotificationRecord<T>[]> {
    if (params.items.length === 0) {
      return [];
    }
    return runInMongoTransaction(this.client, async (session) => {
      const records: NotificationRecord<T>[] = [];
      for (const item of params.items) {
        // The transaction intentionally sequences each item so any failure rolls back the complete batch.

        records.push(
          // eslint-disable-next-line no-await-in-loop
          await this.createInTransaction(
            {
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
            },
            session,
          ),
        );
      }
      return records;
    });
  }

  async findPendingDeliveries<T = NotificationData>(
    params: FindPendingNotificationDeliveriesParams,
  ): Promise<PendingNotificationDelivery<T>[]> {
    const claimed: NotificationDeliveryDocument[] = [];
    for (let index = 0; index < params.count; index += 1) {
      const claimToken = randomUUID();
      // Each claim is a single indexed compare-and-set operation. Sorting makes competing workers deterministic.
      // eslint-disable-next-line no-await-in-loop
      const delivery = await this.deliveries.findOneAndUpdate(
        {
          targetType: params.targetType,
          status: NotificationStatus.Pending,
          sendAfter: { $lte: params.now },
          $or: [{ claimExpiresAt: null }, { claimExpiresAt: { $lte: params.now } }],
          ...(params.targetId ? { targetId: params.targetId } : {}),
        },
        {
          $set: {
            claimToken,
            claimExpiresAt: new Date(params.now.getTime() + MongoNotificationClaimLeaseMs),
            updatedAt: params.now,
          },
        },
        { sort: { priority: -1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false },
      );
      if (!delivery) {
        break;
      }
      claimed.push(delivery);
    }
    if (claimed.length === 0) {
      return [];
    }

    const notificationIds = [...new Set(claimed.map((item) => item.notificationId))];
    const notificationDocuments = await this.notifications.find({ _id: { $in: notificationIds } }).toArray();
    const templateIds = [...new Set(notificationDocuments.map((item) => item.templateId))];
    const versionIds = [...new Set(notificationDocuments.map((item) => item.templateVersionId))];
    const [templates, versions, channels] = await Promise.all([
      this.templates.find({ _id: { $in: templateIds } }).toArray(),
      this.versions.find({ _id: { $in: versionIds } }).toArray(),
      this.channels.find({ templateVersionId: { $in: versionIds } }).toArray(),
    ]);
    const notificationById = new Map(
      notificationDocuments.flatMap((notification) => {
        const template = templates.find((item) => item._id === notification.templateId);
        const version = versions.find((item) => item._id === notification.templateVersionId);
        if (!template || !version) {
          return [];
        }
        return [
          [
            notification._id,
            mapNotification<T>(
              notification as NotificationDocument<T>,
              template,
              version,
              channels,
              this.payloadCrypto,
            ),
          ] as const,
        ];
      }),
    );
    return claimed.flatMap((delivery) => {
      const notification = notificationById.get(delivery.notificationId);
      return notification && delivery.claimToken
        ? [{ claimToken: delivery.claimToken, delivery: mapDelivery(delivery), notification }]
        : [];
    });
  }

  async saveDeliveryResults(results: NotificationDeliveryResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }
    await runInMongoTransaction(this.client, async (session) => {
      for (const result of results) {
        // A result is valid only while its token still owns a pending row; administrative transitions clear the token.
        // eslint-disable-next-line no-await-in-loop
        const delivery = await this.deliveries.findOne(
          {
            _id: result.id,
            createdAt: result.createdAt,
            status: NotificationStatus.Pending,
            claimToken: result.claimToken,
          },
          { session },
        );
        if (!delivery) {
          continue;
        }
        const now = new Date();
        const attempts = delivery.attempts + 1;
        const update: Partial<NotificationDeliveryDocument> = {
          attempts,
          status: result.status,
          error: result.error ?? null,
          claimToken: null,
          claimExpiresAt: null,
          updatedAt: now,
        };
        if (result.status === NotificationStatus.Sent) {
          update.sentAt = now;
        }
        if (result.status === NotificationStatus.Pending) {
          const retryDelay = Math.min(
            retryMaxDelaySeconds,
            Math.max(result.retryAfterSeconds ?? 0, retryBaseDelaySeconds * 2 ** Math.max(0, attempts - 1)),
          );
          update.sendAfter = new Date(now.getTime() + retryDelay * 1000);
        }
        // The claim token fences a worker whose lease was reassigned while it was sending.
        // eslint-disable-next-line no-await-in-loop
        await this.deliveries.updateOne(
          {
            _id: result.id,
            createdAt: result.createdAt,
            status: NotificationStatus.Pending,
            claimToken: result.claimToken,
          },
          { $set: update },
          { session },
        );
      }
    });
  }

  async countRecentDeliveryErrors(params: FindRecentNotificationDeliveryErrorsParams): Promise<number> {
    const count = await this.deliveries.countDocuments({
      status: NotificationStatus.Error,
      updatedAt: { $gt: params.fromDate },
      ...(params.targetType ? { targetType: params.targetType } : {}),
    });
    return Math.min(count, params.limit);
  }

  private async createInTransaction<T>(
    params: CreateTemplateNotificationParams<T>,
    session: ClientSession,
  ): Promise<NotificationRecord<T>> {
    // eslint-disable-next-line sonarjs/deprecation
    const routes = resolveRoutes(params.deliveries, params.channels);
    const inAppVisible = params.inAppVisible ?? true;
    if (routes.length === 0 && !inAppVisible) {
      throw new EmptyNotificationAudienceError();
    }
    const template = await this.templates.findOne({ code: params.templateCode }, { session });
    if (!template) {
      throw new NotificationTemplateNotFoundError(params.templateCode);
    }
    if (!template.currentVersionId) {
      throw new InvalidNotificationTemplateError(`${template.code} has no published version`);
    }
    const version = await this.versions.findOne({ _id: template.currentVersionId }, { session });
    if (!version?.publishedAt) {
      throw new InvalidNotificationTemplateError(`${template.code} has no published version`);
    }
    const channels = await this.channels.find({ templateVersionId: version._id }, { session }).toArray();
    for (const route of routes) {
      if (!channels.some((item) => item.channel === route.channel)) {
        throw new NotificationTemplateChannelNotFoundError(template.code, route.channel);
      }
    }
    if (inAppVisible && !channels.some((item) => item.channel === NotificationChannel.InApp)) {
      throw new NotificationTemplateChannelNotFoundError(template.code, NotificationChannel.InApp);
    }
    const createdAt = new Date();
    const notification: NotificationDocument<T> = {
      _id: randomUUID(),
      targetType: params.targetType,
      targetId: params.targetId,
      templateId: template._id,
      templateVersionId: version._id,
      data: params.data ?? null,
      sensitiveData: null,
      extra: params.extra ?? null,
      inAppVisible,
      broadcastId: null,
      createdAt,
    };
    if (params.sensitiveData) {
      notification.sensitiveData = this.payloadCrypto.encrypt(params.sensitiveData, payloadAad(notification));
    }
    await this.notifications.insertOne(notification as NotificationDocument, { session });
    if (routes.length > 0) {
      await this.deliveries.insertMany(
        routes.map((route) => ({
          _id: randomUUID(),
          notificationId: notification._id,
          targetType: params.targetType,
          targetId: params.targetId,
          channel: route.channel,
          status: NotificationStatus.Pending,
          error: null,
          attempts: 0,
          provider: route.provider,
          broadcastId: null,
          priority: params.priority ?? NotificationPriority.Default,
          sendAfter: params.sendAfter ?? createdAt,
          sentAt: null,
          claimToken: null,
          claimExpiresAt: null,
          createdAt,
          updatedAt: createdAt,
        })),
        { session },
      );
    }
    return mapNotification(notification, template, version, channels, this.payloadCrypto);
  }
}

function validateTemplateChannels(channels: UpsertNotificationTemplateParams['channels']): void {
  if (channels.length === 0) {
    throw new InvalidNotificationTemplateError('at least one channel is required');
  }
  if (new Set(channels.map((item) => item.channel)).size !== channels.length) {
    throw new InvalidNotificationTemplateError('channel names must be unique');
  }
  const invalid = channels.find((item) => !isNotificationTemplateChannelContent(item.channel, item.content));
  if (invalid) {
    throw new InvalidNotificationTemplateError(`invalid ${invalid.channel} channel content`);
  }
}

function resolveRoutes(
  deliveries: NotificationDeliveryRoute[] | undefined,
  channels: NotificationDeliveryChannel[] | undefined,
): NotificationDeliveryRoute[] {
  const requested =
    deliveries ??
    (channels ?? defaultDeliveryChannels).map((channel) => ({ channel, provider: defaultProvider(channel) }));
  const result = new Map<NotificationDeliveryChannel, NotificationDeliveryRoute>();
  for (const route of requested) {
    if (!isProviderCompatible(route)) {
      throw new InvalidNotificationTemplateError(`${route.provider} cannot deliver the ${route.channel} channel`);
    }
    const existing = result.get(route.channel);
    if (existing && existing.provider !== route.provider) {
      throw new InvalidNotificationTemplateError(`only one provider can be selected for ${route.channel}`);
    }
    result.set(route.channel, route);
  }
  return [...result.values()];
}

function isProviderCompatible(route: NotificationDeliveryRoute): boolean {
  if (route.channel === NotificationChannel.Bot) {
    return [NotificationDeliveryProvider.TelegramBot, NotificationDeliveryProvider.DiscordBot].includes(route.provider);
  }
  if (route.channel === NotificationChannel.Email) {
    return [NotificationDeliveryProvider.Resend, NotificationDeliveryProvider.MailPace].includes(route.provider);
  }
  return [NotificationDeliveryProvider.GoogleFcm, NotificationDeliveryProvider.AppleApns].includes(route.provider);
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

export function mapTemplate(
  template: NotificationTemplateDocument,
  channels: NotificationTemplateVersionChannelDocument[],
  version?: NotificationTemplateVersionDocument | null,
): NotificationTemplateRecord {
  const mapped: Partial<Record<NotificationChannel, NotificationTemplateChannelRecord>> = {};
  for (const item of channels) {
    mapped[item.channel] = { id: item._id, channel: item.channel, engine: item.engine, content: item.content };
  }
  return {
    id: template._id,
    code: template.code,
    description: template.description,
    source: template.source,
    name: template.name,
    status: template.status,
    versionId: version?._id,
    version: version?.version,
    variablesSchema: version?.variablesSchema,
    channels: mapped,
  };
}

function mapNotification<T>(
  notification: NotificationDocument<T>,
  template: NotificationTemplateDocument,
  version: NotificationTemplateVersionDocument,
  allChannels: NotificationTemplateVersionChannelDocument[],
  crypto: NotificationMongoPayloadCryptoService,
): NotificationRecord<T> {
  return {
    id: notification._id,
    targetType: notification.targetType,
    targetId: notification.targetId,
    template: mapTemplate(
      template,
      allChannels.filter((item) => item.templateVersionId === version._id),
      version,
    ),
    data: notification.data,
    sensitiveData: isEncryptedNotificationPayload(notification.sensitiveData)
      ? crypto.decrypt(notification.sensitiveData, payloadAad(notification))
      : null,
    extra: notification.extra,
    inAppVisible: notification.inAppVisible,
    broadcastId: notification.broadcastId,
    templateVersionId: notification.templateVersionId,
    createdAt: notification.createdAt,
  };
}

function mapDelivery(delivery: NotificationDeliveryDocument): NotificationDeliveryRecord {
  return {
    id: delivery._id,
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
  channels: Array<NotificationTemplateVersionChannelDocument | UpsertNotificationTemplateParams['channels'][number]>,
): string {
  return JSON.stringify(
    channels
      .map((item) => ({
        channel: item.channel,
        engine: item.engine ?? NotificationTemplateEngine.StringFormat,
        content: item.content,
      }))
      .sort((left, right) => left.channel.localeCompare(right.channel)),
  );
}

function payloadAad(notification: Pick<NotificationDocument, '_id' | 'targetType' | 'targetId'>): string {
  return `notification:${notification._id}:${notification.targetType}:${notification.targetId}`;
}
