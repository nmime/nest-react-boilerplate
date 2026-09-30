import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { S3Service } from '@app/backend-common-s3';
import {
  NotificationBroadcastPersistence,
  NotificationPersistence,
  type CreateAdminNotificationTemplateInput,
  type CreateNotificationBroadcastInput,
  type CreateNotificationSegmentInput,
  type NotificationBroadcastTransitionInput,
  type UpdateAdminNotificationTemplateInput,
  type UpdateNotificationBroadcastInput,
  type UpdateNotificationSegmentInput,
} from '@app/backend-feature-notification-shared';
import {
  NotificationSegmentKind,
  NotificationTargetType,
  type NotificationBroadcastStatus,
  type NotificationData,
  type NotificationDeliveryProvider,
  type NotificationDeliveryChannel,
  type NotificationTemplateAdminRecord,
} from '@app/common-notifications';
import { NotificationConfigService } from '../config';
import { DefaultMessageStrategy } from '../messages';
import type { NotificationRenderedMessage } from '../strategy';
import { NotificationSegmentResolverRegistry } from './notification-segment-resolver-registry.service';

@Injectable()
export class NotificationAdminService {
  private readonly requireIndependentApproval: boolean;
  private readonly csvMaxBytes: number;

  constructor(
    config: NotificationConfigService,
    private readonly broadcasts: NotificationBroadcastPersistence,
    private readonly notifications: NotificationPersistence,
    private readonly objectStorage: S3Service,
    private readonly resolvers: NotificationSegmentResolverRegistry,
  ) {
    this.requireIndependentApproval = config.broadcasts.requireIndependentApproval;
    this.csvMaxBytes = config.broadcasts.csvMaxBytes;
  }

  listTemplates(tenantId: string) {
    return this.broadcasts.listTemplates(tenantId);
  }

  getTemplate(id: string, tenantId: string) {
    return this.broadcasts.getTemplate(id, tenantId);
  }

  createTemplate(input: CreateAdminNotificationTemplateInput, transaction?: unknown) {
    return this.broadcasts.createAdminTemplate(input, transaction);
  }

  updateTemplate(id: string, tenantId: string, input: UpdateAdminNotificationTemplateInput, transaction?: unknown) {
    return this.broadcasts.updateAdminTemplate(id, tenantId, input, transaction);
  }

  publishTemplate(id: string, tenantId: string, actorId: string, transaction?: unknown) {
    return this.broadcasts.publishAdminTemplate(id, tenantId, actorId, transaction);
  }

  archiveTemplate(id: string, tenantId: string, actorId: string, transaction?: unknown) {
    return this.broadcasts.archiveAdminTemplate(id, tenantId, actorId, transaction);
  }

  async previewTemplate(
    id: string,
    tenantId: string,
    channel: NotificationDeliveryChannel,
    language: string,
    variables: NotificationData,
  ): Promise<NotificationRenderedMessage> {
    const template = await this.requireTemplate(id, tenantId);
    const version = template.versions.find((item) => item.id === template.currentVersionId);
    if (!version) {
      throw new Error('notification_template_version_missing');
    }
    const message = new DefaultMessageStrategy(
      {
        id: 'preview',
        tenantId,
        targetType: NotificationTargetType.User,
        targetId: 'preview',
        template: {
          id: template.id,
          code: template.code,
          name: template.name,
          description: template.description,
          source: template.source,
          status: template.status,
          versionId: version.id,
          version: version.version,
          variablesSchema: version.variablesSchema,
          channels: version.channels,
        },
        data: variables,
        sensitiveData: null,
        extra: { useLanguage: language },
        inAppVisible: false,
        templateVersionId: version.id,
        createdAt: new Date(),
      },
      channel,
    ).getMessage(language);
    if (!message) {
      throw new Error('notification_template_preview_failed');
    }
    return message;
  }

  async testSend(
    input: {
      id: string;
      tenantId: string;
      targetType: NotificationTargetType;
      targetId: string;
      channel: NotificationDeliveryChannel;
      provider: NotificationDeliveryProvider;
      language?: string;
      variables: NotificationData;
    },
    transaction?: unknown,
  ) {
    const template = await this.requireTemplate(input.id, input.tenantId, transaction);
    const version = template.versions.find((item) => item.id === template.currentVersionId && item.publishedAt);
    if (!version) {
      throw new Error('notification_template_version_not_published');
    }
    const [data, sensitiveData] = splitSensitive(version.variablesSchema, input.variables);
    return this.notifications.create(
      {
        tenantId: input.tenantId,
        targetType: input.targetType,
        targetId: input.targetId,
        templateCode: template.code,
        deliveries: [{ channel: input.channel, provider: input.provider }],
        inAppVisible: false,
        data,
        sensitiveData,
        extra: input.language ? { useLanguage: input.language } : undefined,
      },
      transaction,
    );
  }

  listSegments(tenantId: string, includeArchived = false) {
    return this.broadcasts.listSegments({ tenantId, includeArchived });
  }

  getSegment(id: string, tenantId: string) {
    return this.broadcasts.getSegment(id, tenantId);
  }

  createSegment(input: CreateNotificationSegmentInput, transaction?: unknown) {
    if (input.kind === NotificationSegmentKind.Dynamic) {
      this.requireResolver(input.resolverKey);
    }
    return this.broadcasts.createSegment(input, transaction);
  }

  updateSegment(id: string, tenantId: string, input: UpdateNotificationSegmentInput, transaction?: unknown) {
    if (input.resolverKey) {
      this.requireResolver(input.resolverKey);
    }
    return this.broadcasts.updateSegment(id, tenantId, input, transaction);
  }

  archiveSegment(id: string, tenantId: string, actorId: string, transaction?: unknown) {
    return this.broadcasts.archiveSegment(id, tenantId, actorId, transaction);
  }

  listResolvers() {
    return this.resolvers.list();
  }

  async estimateSegment(id: string, tenantId: string): Promise<{ count: number }> {
    const segment = await this.requireSegment(id, tenantId);
    if (segment.kind === NotificationSegmentKind.Static) {
      return { count: segment.memberCount };
    }
    const resolver = this.requireResolver(segment.resolverKey);
    return {
      count: await resolver.estimate({ tenantId, parameters: segment.parameters, snapshotAt: new Date() }),
    };
  }

  async uploadSegmentCsv(
    input: {
      id: string;
      tenantId: string;
      actorId: string;
      filename: string;
      contentBase64: string;
    },
    transaction?: unknown,
  ) {
    const segment = await this.requireSegment(input.id, input.tenantId, transaction);
    if (segment.kind !== NotificationSegmentKind.Static) {
      throw new Error('notification_segment_upload_static_only');
    }
    if (!input.filename.toLowerCase().endsWith('.csv')) {
      throw new Error('notification_csv_filename');
    }
    const bytes = Buffer.from(input.contentBase64, 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > this.csvMaxBytes) {
      throw new Error('notification_csv_size');
    }
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const objectKey = `notification-segments/${input.tenantId}/${segment.id}/${randomUUID()}.csv`;
    await this.objectStorage.putObject({
      key: objectKey,
      body: bytes,
      contentType: 'text/csv; charset=utf-8',
      metadata: { checksum, segmentId: segment.id },
    });
    return this.broadcasts.createSegmentUpload(
      {
        segmentId: segment.id,
        objectKey,
        checksum,
        actorId: input.actorId,
      },
      transaction,
    );
  }

  getSegmentUpload(id: string, tenantId: string) {
    return this.broadcasts.getSegmentUpload(id, tenantId);
  }

  listBroadcasts(tenantId: string, status?: NotificationBroadcastStatus) {
    return this.broadcasts.listBroadcasts(tenantId, status);
  }

  getBroadcast(id: string, tenantId: string) {
    return this.broadcasts.getBroadcast(id, tenantId);
  }

  createBroadcast(input: CreateNotificationBroadcastInput, transaction?: unknown) {
    return this.broadcasts.createBroadcast(input, transaction);
  }

  updateBroadcast(id: string, tenantId: string, input: UpdateNotificationBroadcastInput, transaction?: unknown) {
    return this.broadcasts.updateBroadcast(id, tenantId, input, transaction);
  }

  command(input: NotificationBroadcastTransitionInput, transaction?: unknown) {
    return this.broadcasts.transitionBroadcast(
      {
        ...input,
        requireIndependentApproval: this.requireIndependentApproval,
      },
      transaction,
    );
  }

  private requireResolver(key: string | null | undefined) {
    const resolver = key ? this.resolvers.resolve(key) : undefined;
    if (!resolver) {
      throw new Error('notification_segment_resolver_missing');
    }
    return resolver;
  }

  private async requireTemplate(
    id: string,
    tenantId: string,
    transaction?: unknown,
  ): Promise<NotificationTemplateAdminRecord> {
    const template = await this.broadcasts.getTemplate(id, tenantId, transaction);
    if (!template) {
      throw new Error('notification_template_not_found');
    }
    return template;
  }

  private async requireSegment(id: string, tenantId: string, transaction?: unknown) {
    const segment = await this.broadcasts.getSegment(id, tenantId, transaction);
    if (!segment) {
      throw new Error('notification_segment_not_found');
    }
    return segment;
  }
}

function splitSensitive(
  schema: Record<string, { sensitive?: boolean }>,
  variables: NotificationData,
): [NotificationData, NotificationData] {
  const data: NotificationData = {};
  const sensitive: NotificationData = {};
  for (const [key, value] of Object.entries(variables)) {
    (schema[key]?.sensitive ? sensitive : data)[key] = value;
  }
  return [data, sensitive];
}
