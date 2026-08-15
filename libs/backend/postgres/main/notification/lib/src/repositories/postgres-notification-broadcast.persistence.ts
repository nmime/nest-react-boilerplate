import { randomUUID } from 'node:crypto';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  NotificationBroadcastPersistence,
  type ClaimedNotificationSegmentUpload,
  type CompleteNotificationSegmentUploadInput,
  type CreateAdminNotificationTemplateInput,
  type CreateNotificationBroadcastInput,
  type CreateNotificationSegmentInput,
  type CreateNotificationSegmentUploadInput,
  type NotificationBroadcastMaterializationContext,
  type NotificationBroadcastTransitionInput,
  type NotificationSegmentListFilters,
  type NotificationSnapshotCollectionContext,
  type NotificationTemplateChannelInput,
  type UpdateAdminNotificationTemplateInput,
  type UpdateNotificationBroadcastInput,
  type UpdateNotificationSegmentInput,
} from '@app/backend-feature-notification-shared';
import {
  NotificationAudienceSnapshotStatus,
  NotificationBroadcastStatus,
  NotificationChannel,
  type NotificationAudienceMember,
  type NotificationAudienceSnapshotRecord,
  type NotificationBroadcastRecord,
  type NotificationData,
  type NotificationDeliveryChannel,
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationSegmentKind,
  type NotificationSegmentRecord,
  NotificationSegmentStatus,
  type NotificationSegmentUploadRecord,
  NotificationSegmentUploadStatus,
  NotificationStatus,
  type NotificationTemplateAdminRecord,
  type NotificationTemplateChannelRecord,
  type NotificationTemplateVersionRecord,
  NotificationTemplateEngine,
  NotificationTemplateSource,
  NotificationTemplateStatus,
  isNotificationDeliveryChannel,
  isNotificationTemplateChannelContent,
} from '@app/common-notifications';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';
import {
  EmptyNotificationDeliveryClaimId,
  NotificationAudienceSnapshotEntity,
  NotificationAudienceSnapshotMemberEntity,
  NotificationBroadcastCommandEntity,
  NotificationBroadcastEntity,
  NotificationBroadcastSegmentEntity,
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationSegmentEntity,
  NotificationSegmentMemberEntity,
  NotificationSegmentUploadEntity,
  NotificationTemplateEntity,
  NotificationTemplateVersionChannelEntity,
  NotificationTemplateVersionEntity,
  UnclaimedNotificationBroadcastClaimId,
  UnclaimedNotificationSegmentUploadClaimId,
} from '../infrastructure/data-access/entities';

const claimLeaseMs = 5 * 60 * 1000;

@Injectable()
export class PostgresNotificationBroadcastPersistence extends NotificationBroadcastPersistence {
  constructor(
    @Inject(EntityManager) private readonly entityManager: EntityManager,
    private readonly payloadCrypto: NotificationPayloadCryptoService,
  ) {
    super();
  }

  async listTemplates(tenantId: string): Promise<NotificationTemplateAdminRecord[]> {
    const templates = await this.entityManager.find(
      NotificationTemplateEntity,
      { $or: [{ tenantId }, { tenantId: null }] },
      { orderBy: { updatedAt: 'DESC' } },
    );
    return Promise.all(templates.map((template) => this.mapTemplate(this.entityManager, template)));
  }

  async getTemplate(id: string, tenantId: string): Promise<NotificationTemplateAdminRecord | null> {
    const template = await this.entityManager.findOne(NotificationTemplateEntity, {
      id,
      $or: [{ tenantId }, { tenantId: null }],
    });
    return template ? this.mapTemplate(this.entityManager, template) : null;
  }

  async createAdminTemplate(input: CreateAdminNotificationTemplateInput): Promise<NotificationTemplateAdminRecord> {
    this.validateChannels(input.channels, true);
    return this.entityManager.transactional(async (em) => {
      const existing = await em.findOne(NotificationTemplateEntity, { code: input.code });
      if (existing) {
        throw new Error('notification_template_code_conflict');
      }
      const now = new Date();
      const template = new NotificationTemplateEntity({
        code: input.code,
        name: input.name,
        description: input.description,
        tenantId: input.tenantId,
        source: NotificationTemplateSource.Admin,
        status: NotificationTemplateStatus.Draft,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now,
      });
      const version = new NotificationTemplateVersionEntity({
        templateId: template.id,
        version: 1,
        variablesSchema: input.variablesSchema,
        createdAt: now,
        updatedAt: now,
      });
      // `notification_templates.current_version_id` and
      // `notification_template_versions.template_id` form a circular FK pair, and
      // the version channels FK into versions. The entities carry no relation
      // metadata, so a single flush would order the inserts arbitrarily; stage
      // them parent-first inside the same transaction.
      em.persist(template);
      await em.flush();
      template.currentVersionId = version.id;
      em.persist(version);
      await em.flush();
      em.persist(this.channelEntities(version.id, input.channels, now));
      await em.flush();
      return this.mapTemplate(em, template);
    });
  }

  async updateAdminTemplate(
    id: string,
    tenantId: string,
    input: UpdateAdminNotificationTemplateInput,
  ): Promise<NotificationTemplateAdminRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const template = await em.findOne(NotificationTemplateEntity, { id, tenantId });
      if (!template) {
        return null;
      }
      this.requireMutableAdminTemplate(template);
      if (input.expectedUpdatedAt && template.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new Error('notification_template_stale_write');
      }
      let version = template.currentVersionId
        ? await em.findOne(NotificationTemplateVersionEntity, { id: template.currentVersionId })
        : null;
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      if (version.publishedAt) {
        const previousChannels = await em.find(NotificationTemplateVersionChannelEntity, {
          templateVersionId: version.id,
        });
        const nextVersion = new NotificationTemplateVersionEntity({
          templateId: template.id,
          version: version.version + 1,
          variablesSchema: version.variablesSchema,
        });
        version = nextVersion;
        // Stage parent-first: the entities have no relation metadata, so a single
        // flush could insert the cloned channel rows before their version row.
        em.persist(nextVersion);
        await em.flush();
        em.persist(
          previousChannels.map(
            (channel) =>
              new NotificationTemplateVersionChannelEntity({
                templateVersionId: nextVersion.id,
                channel: channel.channel,
                engine: NotificationTemplateEngine.StringFormat,
                content: channel.content,
              }),
          ),
        );
        await em.flush();
        template.currentVersionId = version.id;
        template.status = NotificationTemplateStatus.Draft;
      }
      if (input.channels) {
        this.validateChannels(input.channels, true);
        const currentChannels = await em.find(NotificationTemplateVersionChannelEntity, {
          templateVersionId: version.id,
        });
        em.remove(currentChannels);
        em.persist(this.channelEntities(version.id, input.channels, new Date()));
      }
      if (input.variablesSchema) {
        version.variablesSchema = input.variablesSchema;
      }
      if (input.name !== undefined) {
        template.name = input.name;
      }
      if (input.description !== undefined) {
        template.description = input.description;
      }
      template.updatedBy = input.actorId;
      template.updatedAt = new Date();
      version.updatedAt = template.updatedAt;
      await em.flush();
      return this.mapTemplate(em, template);
    });
  }

  async publishAdminTemplate(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<NotificationTemplateAdminRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const template = await em.findOne(NotificationTemplateEntity, { id, tenantId });
      if (!template) {
        return null;
      }
      this.requireMutableAdminTemplate(template);
      const version = template.currentVersionId
        ? await em.findOne(NotificationTemplateVersionEntity, { id: template.currentVersionId })
        : null;
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      if (!version.publishedAt) {
        const channels = await em.find(NotificationTemplateVersionChannelEntity, { templateVersionId: version.id });
        this.validateChannels(channels, true);
        version.publishedAt = new Date();
        version.publishedBy = actorId;
        version.updatedAt = version.publishedAt;
      }
      template.status = NotificationTemplateStatus.Published;
      template.updatedBy = actorId;
      template.updatedAt = new Date();
      await em.flush();
      return this.mapTemplate(em, template);
    });
  }

  async archiveAdminTemplate(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<NotificationTemplateAdminRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const template = await em.findOne(NotificationTemplateEntity, { id, tenantId });
      if (!template) {
        return null;
      }
      if (template.source !== NotificationTemplateSource.Admin) {
        throw new Error('notification_template_code_owned');
      }
      template.status = NotificationTemplateStatus.Archived;
      template.updatedBy = actorId;
      template.updatedAt = new Date();
      await em.flush();
      return this.mapTemplate(em, template);
    });
  }

  async listSegments(filters: NotificationSegmentListFilters): Promise<NotificationSegmentRecord[]> {
    const segments = await this.entityManager.find(
      NotificationSegmentEntity,
      {
        tenantId: filters.tenantId,
        ...(filters.includeArchived ? {} : { status: NotificationSegmentStatus.Active }),
      },
      { orderBy: { updatedAt: 'DESC' } },
    );
    return segments.map(mapSegment);
  }

  async getSegment(id: string, tenantId: string): Promise<NotificationSegmentRecord | null> {
    const segment = await this.entityManager.findOne(NotificationSegmentEntity, { id, tenantId });
    return segment ? mapSegment(segment) : null;
  }

  async createSegment(input: CreateNotificationSegmentInput): Promise<NotificationSegmentRecord> {
    return this.entityManager.transactional(async (em) => {
      const existing = await em.findOne(NotificationSegmentEntity, {
        tenantId: input.tenantId,
        name: input.name,
        status: NotificationSegmentStatus.Active,
      });
      if (existing) {
        throw new Error('notification_segment_name_conflict');
      }
      if (input.kind === NotificationSegmentKind.Dynamic && !input.resolverKey) {
        throw new Error('notification_segment_resolver_required');
      }
      const segment = new NotificationSegmentEntity({
        tenantId: input.tenantId,
        name: input.name,
        kind: input.kind,
        resolverKey: input.resolverKey ?? null,
        parameters: input.parameters ?? {},
        createdBy: input.actorId,
        updatedBy: input.actorId,
      });
      em.persist(segment);
      await em.flush();
      return mapSegment(segment);
    });
  }

  async updateSegment(
    id: string,
    tenantId: string,
    input: UpdateNotificationSegmentInput,
  ): Promise<NotificationSegmentRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const segment = await em.findOne(NotificationSegmentEntity, { id, tenantId });
      if (!segment) {
        return null;
      }
      if (segment.status === NotificationSegmentStatus.Archived) {
        throw new Error('notification_segment_archived');
      }
      if (input.name !== undefined) {
        segment.name = input.name;
      }
      if (input.resolverKey !== undefined) {
        segment.resolverKey = input.resolverKey;
      }
      if (input.parameters !== undefined) {
        segment.parameters = input.parameters;
      }
      segment.updatedBy = input.actorId;
      segment.updatedAt = new Date();
      await em.flush();
      return mapSegment(segment);
    });
  }

  async archiveSegment(id: string, tenantId: string, actorId: string): Promise<NotificationSegmentRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const segment = await em.findOne(NotificationSegmentEntity, { id, tenantId });
      if (!segment) {
        return null;
      }
      segment.status = NotificationSegmentStatus.Archived;
      segment.updatedBy = actorId;
      segment.updatedAt = new Date();
      await em.flush();
      return mapSegment(segment);
    });
  }

  async createSegmentUpload(input: CreateNotificationSegmentUploadInput): Promise<NotificationSegmentUploadRecord> {
    return this.entityManager.transactional(async (em) => {
      const existing = await em.findOne(NotificationSegmentUploadEntity, {
        segmentId: input.segmentId,
        checksum: input.checksum,
      });
      if (existing) {
        return mapUpload(existing);
      }
      const upload = new NotificationSegmentUploadEntity({
        segmentId: input.segmentId,
        objectKey: input.objectKey,
        checksum: input.checksum,
        createdBy: input.actorId,
      });
      em.persist(upload);
      await em.flush();
      return mapUpload(upload);
    });
  }

  async getSegmentUpload(id: string, tenantId: string): Promise<NotificationSegmentUploadRecord | null> {
    const upload = await this.entityManager.findOne(NotificationSegmentUploadEntity, { id });
    if (!upload) {
      return null;
    }
    const segment = await this.entityManager.findOne(NotificationSegmentEntity, { id: upload.segmentId, tenantId });
    return segment ? mapUpload(upload) : null;
  }

  async claimSegmentUpload(now: Date): Promise<ClaimedNotificationSegmentUpload | null> {
    return this.entityManager.transactional(async (em) => {
      const upload = await em.findOne(
        NotificationSegmentUploadEntity,
        {
          status: { $in: [NotificationSegmentUploadStatus.Pending, NotificationSegmentUploadStatus.Processing] },
          claimedAt: { $lte: new Date(now.getTime() - claimLeaseMs) },
        },
        { orderBy: { createdAt: 'ASC' }, lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!upload) {
        return null;
      }
      const segment = await em.findOne(NotificationSegmentEntity, { id: upload.segmentId });
      if (!segment) {
        return null;
      }
      upload.status = NotificationSegmentUploadStatus.Processing;
      upload.claimedAt = now;
      upload.claimToken = randomUUID();
      upload.updatedAt = now;
      await em.flush();
      return { ...mapUpload(upload), claimToken: upload.claimToken, tenantId: segment.tenantId };
    });
  }

  async completeSegmentUpload(input: CompleteNotificationSegmentUploadInput): Promise<void> {
    await this.entityManager.transactional(async (em) => {
      const upload = await em.findOne(NotificationSegmentUploadEntity, {
        id: input.uploadId,
        claimToken: input.claimToken,
        status: NotificationSegmentUploadStatus.Processing,
      });
      if (!upload) {
        return;
      }
      const segment = await em.findOne(NotificationSegmentEntity, { id: upload.segmentId });
      if (!segment) {
        return;
      }
      await em.nativeDelete(NotificationSegmentMemberEntity, { segmentId: segment.id });
      const now = new Date();
      em.persist(
        input.members.map(
          (member) =>
            new NotificationSegmentMemberEntity({
              segmentId: segment.id,
              targetType: member.targetType,
              targetId: member.targetId,
              language: member.language ?? null,
              variables: member.variables ?? {},
              createdAt: now,
            }),
        ),
      );
      segment.memberCount = input.members.length;
      segment.updatedAt = now;
      upload.status = NotificationSegmentUploadStatus.Completed;
      upload.totalRows = input.totalRows;
      upload.validRows = input.members.length;
      upload.duplicateRows = input.duplicateRows;
      upload.invalidRows = input.invalidRows;
      upload.errors = input.errors.slice(0, 100);
      upload.claimedAt = new Date(0);
      upload.claimToken = UnclaimedNotificationSegmentUploadClaimId;
      upload.updatedAt = now;
      await em.flush();
    });
  }

  async failSegmentUpload(uploadId: string, claimToken: string, errors: string[]): Promise<void> {
    // The background consumer has no MikroORM request context, so the write runs
    // in its own transaction instead of on the global EntityManager.
    await this.entityManager.transactional((em) =>
      em.nativeUpdate(
        NotificationSegmentUploadEntity,
        { id: uploadId, claimToken, status: NotificationSegmentUploadStatus.Processing },
        {
          status: NotificationSegmentUploadStatus.Failed,
          errors: errors.slice(0, 100),
          claimedAt: new Date(0),
          claimToken: UnclaimedNotificationSegmentUploadClaimId,
          updatedAt: new Date(),
        },
      ),
    );
  }

  async listStaticSegmentMembers(segmentId: string): Promise<NotificationAudienceMember[]> {
    // Reads run inside a transaction so the background consumer, which has no
    // MikroORM request context, never touches the global EntityManager.
    const members = await this.entityManager.transactional((em) =>
      em.find(NotificationSegmentMemberEntity, { segmentId }, { orderBy: { id: 'ASC' } }),
    );
    return members.map(mapAudienceMember);
  }

  async listBroadcasts(tenantId: string, status?: NotificationBroadcastStatus): Promise<NotificationBroadcastRecord[]> {
    const broadcasts = await this.entityManager.find(
      NotificationBroadcastEntity,
      { tenantId, ...(status ? { status } : {}) },
      { orderBy: { createdAt: 'DESC' } },
    );
    return Promise.all(broadcasts.map((broadcast) => this.mapBroadcast(this.entityManager, broadcast)));
  }

  async getBroadcast(id: string, tenantId: string): Promise<NotificationBroadcastRecord | null> {
    const broadcast = await this.entityManager.findOne(NotificationBroadcastEntity, { id, tenantId });
    return broadcast ? this.mapBroadcast(this.entityManager, broadcast) : null;
  }

  async createBroadcast(input: CreateNotificationBroadcastInput): Promise<NotificationBroadcastRecord> {
    this.validateBroadcastInput(input.channel, input.provider, input.priority ?? 0);
    return this.entityManager.transactional(async (em) => {
      await this.requirePublishedVersion(em, input.templateVersionId, input.tenantId);
      await this.requireSegments(em, input.segmentIds, input.tenantId);
      const broadcast = new NotificationBroadcastEntity({
        tenantId: input.tenantId,
        name: input.name,
        templateVersionId: input.templateVersionId,
        channel: input.channel,
        provider: input.provider,
        priority: input.priority ?? 0,
        globalVariables: input.globalVariables ?? {},
        createdBy: input.actorId,
      });
      // Stage parent-first: segment links FK into the broadcast, and the
      // entities carry no relation metadata to order a combined flush.
      em.persist(broadcast);
      await em.flush();
      em.persist(
        input.segmentIds.map(
          (segmentId) => new NotificationBroadcastSegmentEntity({ broadcastId: broadcast.id, segmentId }),
        ),
      );
      await em.flush();
      return this.mapBroadcast(em, broadcast);
    });
  }

  async updateBroadcast(
    id: string,
    tenantId: string,
    input: UpdateNotificationBroadcastInput,
  ): Promise<NotificationBroadcastRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const broadcast = await em.findOne(NotificationBroadcastEntity, { id, tenantId });
      if (!broadcast) {
        return null;
      }
      if (broadcast.status !== NotificationBroadcastStatus.Draft) {
        throw new Error('notification_broadcast_not_draft');
      }
      const channel = input.channel ?? broadcast.channel;
      const provider = input.provider ?? broadcast.provider;
      const priority = input.priority ?? broadcast.priority;
      this.validateBroadcastInput(channel, provider, priority);
      if (input.templateVersionId) {
        await this.requirePublishedVersion(em, input.templateVersionId, tenantId);
      }
      if (input.segmentIds) {
        await this.requireSegments(em, input.segmentIds, tenantId);
        await em.nativeDelete(NotificationBroadcastSegmentEntity, { broadcastId: id });
        em.persist(
          input.segmentIds.map((segmentId) => new NotificationBroadcastSegmentEntity({ broadcastId: id, segmentId })),
        );
      }
      if (input.name !== undefined) {
        broadcast.name = input.name;
      }
      if (input.templateVersionId !== undefined) {
        broadcast.templateVersionId = input.templateVersionId;
      }
      if (input.channel !== undefined) {
        broadcast.channel = input.channel;
      }
      if (input.provider !== undefined) {
        broadcast.provider = input.provider;
      }
      if (input.priority !== undefined) {
        broadcast.priority = input.priority;
      }
      if (input.globalVariables !== undefined) {
        broadcast.globalVariables = input.globalVariables;
      }
      broadcast.updatedAt = new Date();
      await em.flush();
      return this.mapBroadcast(em, broadcast);
    });
  }

  async transitionBroadcast(input: NotificationBroadcastTransitionInput): Promise<NotificationBroadcastRecord | null> {
    return this.entityManager.transactional(async (em) => {
      const broadcast = await em.findOne(
        NotificationBroadcastEntity,
        { id: input.broadcastId, tenantId: input.tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!broadcast) {
        return null;
      }
      const duplicate = await em.findOne(NotificationBroadcastCommandEntity, {
        broadcastId: broadcast.id,
        action: input.action,
        idempotencyKey: input.idempotencyKey,
      });
      if (duplicate) {
        return this.mapBroadcast(em, broadcast);
      }
      await this.applyTransition(em, broadcast, input);
      em.persist(
        new NotificationBroadcastCommandEntity({
          broadcastId: broadcast.id,
          action: input.action,
          idempotencyKey: input.idempotencyKey,
          actorId: input.actorId,
        }),
      );
      broadcast.updatedAt = new Date();
      await em.flush();
      return this.mapBroadcast(em, broadcast);
    });
  }

  async claimSnapshot(now: Date): Promise<NotificationSnapshotCollectionContext | null> {
    return this.entityManager.transactional(async (em) => {
      const snapshot = await em.findOne(
        NotificationAudienceSnapshotEntity,
        {
          status: { $in: [NotificationAudienceSnapshotStatus.Created, NotificationAudienceSnapshotStatus.Collecting] },
          claimedAt: { $lte: new Date(now.getTime() - claimLeaseMs) },
        },
        { orderBy: { createdAt: 'ASC' }, lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!snapshot) {
        return null;
      }
      const broadcast = await em.findOne(NotificationBroadcastEntity, { id: snapshot.broadcastId });
      if (!broadcast || broadcast.status !== NotificationBroadcastStatus.Collecting) {
        return null;
      }
      snapshot.status = NotificationAudienceSnapshotStatus.Collecting;
      snapshot.claimedAt = now;
      snapshot.claimToken = randomUUID();
      snapshot.updatedAt = now;
      await em.flush();
      const segmentLinks = await em.find(NotificationBroadcastSegmentEntity, { broadcastId: broadcast.id });
      const segments = await em.find(NotificationSegmentEntity, {
        id: { $in: segmentLinks.map((link) => link.segmentId) },
        status: NotificationSegmentStatus.Active,
      });
      return {
        claimToken: snapshot.claimToken,
        snapshot: mapSnapshot(snapshot),
        broadcast: await this.mapBroadcast(em, broadcast),
        segments: segments.map(mapSegment),
      };
    });
  }

  async completeSnapshot(snapshotId: string, claimToken: string, members: NotificationAudienceMember[]): Promise<void> {
    await this.entityManager.transactional(async (em) => {
      const snapshot = await em.findOne(NotificationAudienceSnapshotEntity, {
        id: snapshotId,
        claimToken,
        status: NotificationAudienceSnapshotStatus.Collecting,
      });
      if (!snapshot) {
        return;
      }
      const broadcast = await em.findOne(NotificationBroadcastEntity, { id: snapshot.broadcastId });
      if (!broadcast) {
        return;
      }
      const unique = new Map<string, NotificationAudienceMember>();
      let duplicates = 0;
      let conflicts = 0;
      for (const member of members) {
        const key = `${member.targetType}\u0000${member.targetId}`;
        const existing = unique.get(key);
        if (!existing) {
          unique.set(key, member);
        } else if (stableJson(existing) === stableJson(member)) {
          duplicates += 1;
        } else {
          conflicts += 1;
        }
      }
      snapshot.resolvedCount = members.length;
      snapshot.distinctCount = unique.size;
      snapshot.duplicateCount = duplicates;
      snapshot.conflictCount = conflicts;
      snapshot.claimedAt = new Date(0);
      snapshot.claimToken = UnclaimedNotificationBroadcastClaimId;
      snapshot.updatedAt = new Date();
      if (conflicts > 0) {
        snapshot.status = NotificationAudienceSnapshotStatus.Failed;
        snapshot.error = { reason: NotificationErrorReason.InvalidRecipient, message: 'Audience variable conflict.' };
        broadcast.status = NotificationBroadcastStatus.Failed;
      } else {
        em.persist(
          [...unique.values()].map(
            (member) =>
              new NotificationAudienceSnapshotMemberEntity({
                snapshotId,
                targetType: member.targetType,
                targetId: member.targetId,
                language: member.language ?? null,
                variables: member.variables ?? {},
              }),
          ),
        );
        snapshot.status = NotificationAudienceSnapshotStatus.Completed;
        broadcast.status = NotificationBroadcastStatus.Ready;
        broadcast.snapshotCount = unique.size;
      }
      broadcast.updatedAt = snapshot.updatedAt;
      await em.flush();
    });
  }

  async failSnapshot(snapshotId: string, claimToken: string, message: string): Promise<void> {
    await this.entityManager.transactional(async (em) => {
      const snapshot = await em.findOne(NotificationAudienceSnapshotEntity, {
        id: snapshotId,
        claimToken,
        status: NotificationAudienceSnapshotStatus.Collecting,
      });
      if (!snapshot) {
        return;
      }
      snapshot.status = NotificationAudienceSnapshotStatus.Failed;
      snapshot.error = { reason: NotificationErrorReason.UnknownError, message: message.slice(0, 500) };
      snapshot.claimedAt = new Date(0);
      snapshot.claimToken = UnclaimedNotificationBroadcastClaimId;
      snapshot.updatedAt = new Date();
      await em.nativeUpdate(
        NotificationBroadcastEntity,
        { id: snapshot.broadcastId },
        { status: NotificationBroadcastStatus.Failed, updatedAt: snapshot.updatedAt },
      );
      await em.flush();
    });
  }

  async claimBroadcastMaterialization(limit: number): Promise<NotificationBroadcastMaterializationContext | null> {
    const now = new Date();
    const broadcast = await this.entityManager.transactional(async (em) => {
      const claimed = await em.findOne(
        NotificationBroadcastEntity,
        {
          status: NotificationBroadcastStatus.Sending,
          materializedAt: null,
          materializationClaimedAt: { $lte: new Date(now.getTime() - claimLeaseMs) },
        },
        { orderBy: { updatedAt: 'ASC' }, lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE },
      );
      if (!claimed) {
        return null;
      }
      claimed.materializationClaimedAt = now;
      claimed.materializationClaimToken = randomUUID();
      await em.flush();
      return claimed;
    });
    if (!broadcast?.materializationClaimToken) {
      return null;
    }
    // Background consumers have no MikroORM request context, so every post-claim
    // read and write runs inside a transaction instead of on the global EntityManager.
    return this.entityManager.transactional(async (em) => {
      const snapshot = await em.findOne(NotificationAudienceSnapshotEntity, {
        broadcastId: broadcast.id,
        status: NotificationAudienceSnapshotStatus.Completed,
      });
      if (!snapshot) {
        return null;
      }
      const members = await em.find(
        NotificationAudienceSnapshotMemberEntity,
        { snapshotId: snapshot.id, materializedAt: null },
        { limit, orderBy: { id: 'ASC' } },
      );
      if (members.length === 0) {
        const materializedAt = new Date();
        await em.nativeUpdate(
          NotificationBroadcastEntity,
          { id: broadcast.id, materializationClaimToken: broadcast.materializationClaimToken },
          {
            materializedAt,
            materializationClaimedAt: new Date(0),
            materializationClaimToken: UnclaimedNotificationBroadcastClaimId,
            updatedAt: materializedAt,
          },
        );
        return null;
      }
      const version = await em.findOne(NotificationTemplateVersionEntity, {
        id: broadcast.templateVersionId,
      });
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      const template = await em.findOne(NotificationTemplateEntity, { id: version.templateId });
      if (!template) {
        throw new Error('notification_template_missing');
      }
      return {
        claimToken: broadcast.materializationClaimToken,
        broadcast: await this.mapBroadcast(em, broadcast),
        snapshotId: snapshot.id,
        template: await this.mapTemplate(em, template),
        members: members.map((member) => ({ id: member.id, ...mapAudienceMember(member) })),
      };
    });
  }

  async materializeBroadcastMembers(context: NotificationBroadcastMaterializationContext): Promise<number> {
    return this.entityManager.transactional(async (em) => {
      const broadcast = await em.findOne(NotificationBroadcastEntity, {
        id: context.broadcast.id,
        status: NotificationBroadcastStatus.Sending,
        materializationClaimToken: context.claimToken,
      });
      if (!broadcast) {
        return 0;
      }
      const version = await em.findOne(NotificationTemplateVersionEntity, { id: broadcast.templateVersionId });
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      const template = await em.findOne(NotificationTemplateEntity, { id: version.templateId });
      if (!template) {
        throw new Error('notification_template_missing');
      }
      const now = new Date();
      const memberIds = context.members.map((item) => item.id);
      const members =
        memberIds.length === 0
          ? []
          : await em.find(NotificationAudienceSnapshotMemberEntity, {
              id: { $in: memberIds },
              snapshotId: context.snapshotId,
              materializedAt: null,
            });
      const existingNotifications =
        members.length === 0
          ? []
          : await em.find(NotificationEntity, {
              broadcastId: broadcast.id,
              $or: members.map((member) => ({ targetType: member.targetType, targetId: member.targetId })),
            });
      const existingTargets = new Set(
        existingNotifications.map((notification) => `${notification.targetType}:${notification.targetId}`),
      );
      let created = 0;
      for (const member of members) {
        const targetKey = `${member.targetType}:${member.targetId}`;
        if (!existingTargets.has(targetKey)) {
          const variables = { ...broadcast.globalVariables, ...member.variables };
          validateVariables(version.variablesSchema, variables);
          const [data, sensitiveData] = splitSensitiveVariables(version.variablesSchema, variables);
          const notification = new NotificationEntity({
            targetType: member.targetType,
            targetId: member.targetId,
            template,
            templateVersionId: version.id,
            broadcastId: broadcast.id,
            data,
            extra: member.language ? { useLanguage: member.language } : null,
            inAppVisible: false,
            createdAt: now,
          });
          if (Object.keys(sensitiveData).length > 0) {
            notification.sensitiveData = this.payloadCrypto.encrypt(
              sensitiveData,
              `notification:${notification.id}:${notification.targetType}:${notification.targetId}`,
            );
          }
          const delivery = new NotificationDeliveryEntity({
            notificationId: notification.id,
            targetType: member.targetType,
            targetId: member.targetId,
            channel: broadcast.channel as NotificationDeliveryChannel,
            status: NotificationStatus.Pending,
            provider: broadcast.provider,
            broadcastId: broadcast.id,
            priority: mapBroadcastPriority(broadcast.priority),
            createdAt: now,
            updatedAt: now,
          });
          em.persist([notification, delivery]);
          existingTargets.add(targetKey);
          created += 1;
        }
        member.materializedAt = now;
      }
      broadcast.queuedCount += created;
      broadcast.pendingCount += created;
      broadcast.updatedAt = now;
      broadcast.materializationClaimedAt = new Date(0);
      broadcast.materializationClaimToken = UnclaimedNotificationBroadcastClaimId;
      await em.flush();
      return created;
    });
  }

  override async materializeNextBroadcastChunk(limit: number): Promise<number> {
    return this.entityManager.transactional(async (em) => {
      const broadcast = await em.findOne(
        NotificationBroadcastEntity,
        { status: NotificationBroadcastStatus.Sending, materializedAt: null },
        {
          orderBy: { updatedAt: 'ASC' },
          lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
        },
      );
      if (!broadcast) {
        return 0;
      }
      const snapshot = await em.findOne(NotificationAudienceSnapshotEntity, {
        broadcastId: broadcast.id,
        status: NotificationAudienceSnapshotStatus.Completed,
      });
      if (!snapshot) {
        return 0;
      }
      const version = await em.findOne(NotificationTemplateVersionEntity, { id: broadcast.templateVersionId });
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      const template = await em.findOne(NotificationTemplateEntity, { id: version.templateId });
      if (!template) {
        throw new Error('notification_template_missing');
      }
      const now = new Date();
      const members = await em.find(
        NotificationAudienceSnapshotMemberEntity,
        { snapshotId: snapshot.id, materializedAt: null },
        { limit, orderBy: { id: 'ASC' }, lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE },
      );
      if (members.length === 0) {
        broadcast.materializedAt = now;
        broadcast.updatedAt = now;
        await em.flush();
        return 0;
      }
      const existingNotifications = await em.find(NotificationEntity, {
        broadcastId: broadcast.id,
        $or: members.map((member) => ({ targetType: member.targetType, targetId: member.targetId })),
      });
      const existingTargets = new Set(
        existingNotifications.map((notification) => `${notification.targetType}:${notification.targetId}`),
      );
      let created = 0;
      for (const member of members) {
        const targetKey = `${member.targetType}:${member.targetId}`;
        if (!existingTargets.has(targetKey)) {
          const variables = { ...broadcast.globalVariables, ...member.variables };
          validateVariables(version.variablesSchema, variables);
          const [data, sensitiveData] = splitSensitiveVariables(version.variablesSchema, variables);
          const notification = new NotificationEntity({
            targetType: member.targetType,
            targetId: member.targetId,
            template,
            templateVersionId: version.id,
            broadcastId: broadcast.id,
            data,
            extra: member.language ? { useLanguage: member.language } : null,
            inAppVisible: false,
            createdAt: now,
          });
          if (Object.keys(sensitiveData).length > 0) {
            notification.sensitiveData = this.payloadCrypto.encrypt(
              sensitiveData,
              `notification:${notification.id}:${notification.targetType}:${notification.targetId}`,
            );
          }
          const delivery = new NotificationDeliveryEntity({
            notificationId: notification.id,
            targetType: member.targetType,
            targetId: member.targetId,
            channel: broadcast.channel as NotificationDeliveryChannel,
            status: NotificationStatus.Pending,
            provider: broadcast.provider,
            broadcastId: broadcast.id,
            priority: mapBroadcastPriority(broadcast.priority),
            createdAt: now,
            updatedAt: now,
          });
          em.persist([notification, delivery]);
          existingTargets.add(targetKey);
          created += 1;
        }
        member.materializedAt = now;
      }
      broadcast.queuedCount += created;
      broadcast.pendingCount += created;
      broadcast.updatedAt = now;
      await em.flush();
      return created;
    });
  }

  async activateDueBroadcasts(now: Date): Promise<number> {
    // The cron scheduler has no MikroORM request context, so the write runs in
    // its own transaction instead of on the global EntityManager.
    return this.entityManager.transactional((em) =>
      em.nativeUpdate(
        NotificationBroadcastEntity,
        { status: NotificationBroadcastStatus.Scheduled, scheduledAt: { $lte: now } },
        { status: NotificationBroadcastStatus.Sending, updatedAt: now },
      ),
    );
  }

  async refreshBroadcastStatistics(): Promise<number> {
    // Reads run inside a transaction so background cron iterations, which have
    // no MikroORM request context, never touch the global EntityManager.
    const candidates = await this.entityManager.transactional((em) =>
      em.find(NotificationBroadcastEntity, {
        status: { $in: [NotificationBroadcastStatus.Sending, NotificationBroadcastStatus.Paused] },
      }),
    );
    const refreshed = await Promise.all(
      candidates.map((candidate) =>
        this.entityManager.transactional(async (em) => {
          const broadcast = await em.findOne(
            NotificationBroadcastEntity,
            {
              id: candidate.id,
              status: { $in: [NotificationBroadcastStatus.Sending, NotificationBroadcastStatus.Paused] },
            },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          );
          if (!broadcast) {
            return false;
          }
          const [queued, sent, rejected, errors, pending, cancelled] = await Promise.all([
            em.count(NotificationDeliveryEntity, { broadcastId: broadcast.id }),
            em.count(NotificationDeliveryEntity, {
              broadcastId: broadcast.id,
              status: NotificationStatus.Sent,
            }),
            em.count(NotificationDeliveryEntity, {
              broadcastId: broadcast.id,
              status: NotificationStatus.Rejected,
            }),
            em.count(NotificationDeliveryEntity, {
              broadcastId: broadcast.id,
              status: NotificationStatus.Error,
            }),
            em.count(NotificationDeliveryEntity, {
              broadcastId: broadcast.id,
              status: { $in: [NotificationStatus.Pending, NotificationStatus.Paused] },
            }),
            em.count(NotificationDeliveryEntity, {
              broadcastId: broadcast.id,
              status: NotificationStatus.Cancelled,
            }),
          ]);
          broadcast.queuedCount = queued;
          broadcast.sentCount = sent;
          broadcast.rejectedCount = rejected;
          broadcast.errorCount = errors;
          broadcast.pendingCount = pending;
          broadcast.cancelledCount = cancelled;
          if (broadcast.status === NotificationBroadcastStatus.Sending && broadcast.materializedAt && pending === 0) {
            broadcast.status = NotificationBroadcastStatus.Completed;
          }
          broadcast.updatedAt = new Date();
          await em.flush();
          return true;
        }),
      ),
    );
    return refreshed.filter(Boolean).length;
  }

  private async applyTransition(
    em: EntityManager,
    broadcast: NotificationBroadcastEntity,
    input: NotificationBroadcastTransitionInput,
  ): Promise<void> {
    switch (input.action) {
      case 'collect-audience':
        return this.collectAudience(em, broadcast);
      case 'approve':
        this.approveBroadcast(broadcast, input.actorId);
        return;
      case 'send':
        this.startBroadcast(broadcast, input.requireIndependentApproval ?? false);
        return;
      case 'schedule':
        this.scheduleBroadcast(broadcast, input);
        return;
      case 'pause':
        return this.updateDeliveryState(
          em,
          broadcast,
          NotificationBroadcastStatus.Sending,
          NotificationBroadcastStatus.Paused,
          NotificationStatus.Pending,
          NotificationStatus.Paused,
        );
      case 'resume':
        return this.updateDeliveryState(
          em,
          broadcast,
          NotificationBroadcastStatus.Paused,
          NotificationBroadcastStatus.Sending,
          NotificationStatus.Paused,
          NotificationStatus.Pending,
        );
      case 'cancel':
        return this.cancelBroadcast(em, broadcast);
      default:
        throw new Error('notification_broadcast_unknown_action');
    }
  }

  private async collectAudience(em: EntityManager, broadcast: NotificationBroadcastEntity): Promise<void> {
    this.requireState(broadcast, [NotificationBroadcastStatus.Draft]);
    const segmentCount = await em.count(NotificationBroadcastSegmentEntity, { broadcastId: broadcast.id });
    if (segmentCount === 0) {
      throw new Error('notification_broadcast_empty_audience');
    }
    em.persist(new NotificationAudienceSnapshotEntity({ broadcastId: broadcast.id, snapshotAt: new Date() }));
    broadcast.status = NotificationBroadcastStatus.Collecting;
  }

  private approveBroadcast(broadcast: NotificationBroadcastEntity, actorId: string): void {
    this.requireState(broadcast, [NotificationBroadcastStatus.Ready]);
    if (broadcast.createdBy === actorId) {
      throw new Error('notification_broadcast_independent_approval_required');
    }
    broadcast.approvedBy = actorId;
  }

  private startBroadcast(broadcast: NotificationBroadcastEntity, requireIndependentApproval: boolean): void {
    this.requireState(broadcast, [NotificationBroadcastStatus.Ready]);
    this.requireApproval(broadcast, requireIndependentApproval);
    broadcast.status = NotificationBroadcastStatus.Sending;
  }

  private scheduleBroadcast(broadcast: NotificationBroadcastEntity, input: NotificationBroadcastTransitionInput): void {
    this.requireState(broadcast, [NotificationBroadcastStatus.Ready]);
    this.requireApproval(broadcast, input.requireIndependentApproval ?? false);
    if (!input.scheduledAt || input.scheduledAt <= new Date()) {
      throw new Error('notification_broadcast_invalid_schedule');
    }
    broadcast.scheduledAt = input.scheduledAt;
    broadcast.status = NotificationBroadcastStatus.Scheduled;
  }

  private requireApproval(broadcast: NotificationBroadcastEntity, required: boolean): void {
    if (required && !broadcast.approvedBy) {
      throw new Error('notification_broadcast_approval_required');
    }
  }

  private async updateDeliveryState(
    em: EntityManager,
    broadcast: NotificationBroadcastEntity,
    requiredBroadcastStatus: NotificationBroadcastStatus,
    nextBroadcastStatus: NotificationBroadcastStatus,
    currentDeliveryStatus: NotificationStatus,
    nextDeliveryStatus: NotificationStatus,
  ): Promise<void> {
    this.requireState(broadcast, [requiredBroadcastStatus]);
    broadcast.status = nextBroadcastStatus;
    await em.nativeUpdate(
      NotificationDeliveryEntity,
      { broadcastId: broadcast.id, status: currentDeliveryStatus },
      {
        status: nextDeliveryStatus,
        claimedAt: new Date(0),
        claimToken: EmptyNotificationDeliveryClaimId,
        updatedAt: new Date(),
      },
    );
  }

  private async cancelBroadcast(em: EntityManager, broadcast: NotificationBroadcastEntity): Promise<void> {
    this.requireState(broadcast, [
      NotificationBroadcastStatus.Draft,
      NotificationBroadcastStatus.Ready,
      NotificationBroadcastStatus.Scheduled,
      NotificationBroadcastStatus.Sending,
      NotificationBroadcastStatus.Paused,
    ]);
    broadcast.status = NotificationBroadcastStatus.Cancelled;
    await em.nativeUpdate(
      NotificationDeliveryEntity,
      { broadcastId: broadcast.id, status: { $in: [NotificationStatus.Pending, NotificationStatus.Paused] } },
      {
        status: NotificationStatus.Cancelled,
        claimedAt: new Date(0),
        claimToken: EmptyNotificationDeliveryClaimId,
        updatedAt: new Date(),
      },
    );
  }

  private requireState(broadcast: NotificationBroadcastEntity, allowed: NotificationBroadcastStatus[]): void {
    if (!allowed.includes(broadcast.status)) {
      throw new Error('notification_broadcast_state_conflict');
    }
  }

  private validateBroadcastInput(
    channel: NotificationChannel,
    provider: NotificationDeliveryProvider,
    priority: number,
  ): void {
    if (!isNotificationDeliveryChannel(channel)) {
      throw new Error('notification_broadcast_delivery_channel_required');
    }
    if (!Number.isInteger(priority) || priority < 0 || priority > 10) {
      throw new Error('notification_broadcast_priority');
    }
    const compatible =
      (channel === NotificationChannel.Bot &&
        [NotificationDeliveryProvider.TelegramBot, NotificationDeliveryProvider.DiscordBot].includes(provider)) ||
      (channel === NotificationChannel.Email &&
        [NotificationDeliveryProvider.Resend, NotificationDeliveryProvider.MailPace].includes(provider)) ||
      (channel === NotificationChannel.Push &&
        [NotificationDeliveryProvider.GoogleFcm, NotificationDeliveryProvider.AppleApns].includes(provider));
    if (!compatible) {
      throw new Error('notification_broadcast_provider_mismatch');
    }
  }

  private async requirePublishedVersion(em: EntityManager, versionId: string, tenantId: string): Promise<void> {
    const version = await em.findOne(NotificationTemplateVersionEntity, { id: versionId });
    if (!version?.publishedAt) {
      throw new Error('notification_template_version_not_published');
    }
    const template = await em.findOne(NotificationTemplateEntity, {
      id: version.templateId,
      status: NotificationTemplateStatus.Published,
      $or: [{ tenantId }, { tenantId: null }],
    });
    if (!template) {
      throw new Error('notification_template_not_available');
    }
  }

  private async requireSegments(em: EntityManager, segmentIds: string[], tenantId: string): Promise<void> {
    if (segmentIds.length === 0) {
      throw new Error('notification_broadcast_empty_audience');
    }
    const segments = await em.find(NotificationSegmentEntity, {
      id: { $in: [...new Set(segmentIds)] },
      tenantId,
      status: NotificationSegmentStatus.Active,
    });
    if (segments.length !== new Set(segmentIds).size) {
      throw new Error('notification_broadcast_segment_not_available');
    }
  }

  private requireMutableAdminTemplate(template: NotificationTemplateEntity): void {
    if (template.source !== NotificationTemplateSource.Admin) {
      throw new Error('notification_template_code_owned');
    }
    if (template.status === NotificationTemplateStatus.Archived) {
      throw new Error('notification_template_archived');
    }
  }

  private validateChannels(channels: NotificationTemplateChannelInput[], adminAuthored: boolean): void {
    if (channels.length === 0) {
      throw new Error('notification_template_channel_required');
    }
    if (new Set(channels.map((channel) => channel.channel)).size !== channels.length) {
      throw new Error('notification_template_channel_duplicate');
    }
    for (const channel of channels) {
      if (!isNotificationTemplateChannelContent(channel.channel, channel.content)) {
        throw new Error('notification_template_channel_invalid');
      }
      if (adminAuthored && channel.engine === NotificationTemplateEngine.Eta) {
        throw new Error('notification_template_eta_forbidden');
      }
    }
  }

  private channelEntities(
    versionId: string,
    channels: NotificationTemplateChannelInput[],
    createdAt: Date,
  ): NotificationTemplateVersionChannelEntity[] {
    return channels.map(
      (channel) =>
        new NotificationTemplateVersionChannelEntity({
          templateVersionId: versionId,
          channel: channel.channel,
          engine: channel.engine ?? NotificationTemplateEngine.StringFormat,
          content: channel.content,
          createdAt,
        }),
    );
  }

  private async mapTemplate(
    em: EntityManager,
    template: NotificationTemplateEntity,
  ): Promise<NotificationTemplateAdminRecord> {
    const versions = await em.find(
      NotificationTemplateVersionEntity,
      { templateId: template.id },
      { orderBy: { version: 'DESC' } },
    );
    const channels =
      versions.length === 0
        ? []
        : await em.find(NotificationTemplateVersionChannelEntity, {
            templateVersionId: { $in: versions.map((version) => version.id) },
          });
    return {
      id: template.id,
      tenantId: template.tenantId,
      code: template.code,
      name: template.name,
      description: template.description,
      source: template.source,
      status: template.status,
      currentVersionId: template.currentVersionId,
      createdBy: template.createdBy,
      updatedBy: template.updatedBy,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      versions: versions.map((version) => mapVersion(version, channels)),
    };
  }

  private async mapBroadcast(
    em: EntityManager,
    entity: NotificationBroadcastEntity,
  ): Promise<NotificationBroadcastRecord> {
    const links = await em.find(NotificationBroadcastSegmentEntity, { broadcastId: entity.id });
    const snapshot = await em.findOne(
      NotificationAudienceSnapshotEntity,
      { broadcastId: entity.id },
      { orderBy: { createdAt: 'DESC' } },
    );
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      templateVersionId: entity.templateVersionId,
      channel: entity.channel as NotificationDeliveryChannel,
      provider: entity.provider,
      priority: entity.priority,
      status: entity.status,
      scheduledAt: entity.scheduledAt,
      globalVariables: entity.globalVariables,
      segmentIds: links.map((link) => link.segmentId),
      snapshot: snapshot ? mapSnapshot(snapshot) : null,
      snapshotCount: entity.snapshotCount,
      queuedCount: entity.queuedCount,
      sentCount: entity.sentCount,
      rejectedCount: entity.rejectedCount,
      errorCount: entity.errorCount,
      pendingCount: entity.pendingCount,
      cancelledCount: entity.cancelledCount,
      materializedAt: entity.materializedAt,
      createdBy: entity.createdBy,
      approvedBy: entity.approvedBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

function mapVersion(
  version: NotificationTemplateVersionEntity,
  allChannels: NotificationTemplateVersionChannelEntity[],
): NotificationTemplateVersionRecord {
  const channels: Partial<Record<NotificationChannel, NotificationTemplateChannelRecord>> = {};
  for (const channel of allChannels.filter((item) => item.templateVersionId === version.id)) {
    channels[channel.channel] = {
      id: channel.id,
      channel: channel.channel,
      engine: channel.engine,
      content: channel.content,
    };
  }
  return {
    id: version.id,
    templateId: version.templateId,
    version: version.version,
    variablesSchema: version.variablesSchema,
    channels,
    publishedAt: version.publishedAt,
    publishedBy: version.publishedBy,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

function mapSegment(entity: NotificationSegmentEntity): NotificationSegmentRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    name: entity.name,
    kind: entity.kind,
    resolverKey: entity.resolverKey,
    parameters: entity.parameters,
    status: entity.status,
    memberCount: entity.memberCount,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapUpload(entity: NotificationSegmentUploadEntity): NotificationSegmentUploadRecord {
  return {
    id: entity.id,
    segmentId: entity.segmentId,
    objectKey: entity.objectKey,
    checksum: entity.checksum,
    status: entity.status,
    totalRows: entity.totalRows,
    validRows: entity.validRows,
    duplicateRows: entity.duplicateRows,
    invalidRows: entity.invalidRows,
    errors: entity.errors,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapSnapshot(entity: NotificationAudienceSnapshotEntity): NotificationAudienceSnapshotRecord {
  return {
    id: entity.id,
    broadcastId: entity.broadcastId,
    snapshotAt: entity.snapshotAt,
    status: entity.status,
    resolvedCount: entity.resolvedCount,
    distinctCount: entity.distinctCount,
    duplicateCount: entity.duplicateCount,
    conflictCount: entity.conflictCount,
    invalidCount: entity.invalidCount,
    error: entity.error,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function mapAudienceMember(
  entity: NotificationSegmentMemberEntity | NotificationAudienceSnapshotMemberEntity,
): NotificationAudienceMember {
  return {
    targetType: entity.targetType,
    targetId: entity.targetId,
    ...(entity.language ? { language: entity.language } : {}),
    ...(Object.keys(entity.variables).length > 0 ? { variables: entity.variables } : {}),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateVariables(schema: Record<string, { type: string; required?: boolean }>, data: NotificationData): void {
  for (const key of Object.keys(data)) {
    if (!schema[key]) {
      throw new Error(`notification_variable_unknown:${key}`);
    }
  }
  for (const [key, definition] of Object.entries(schema)) {
    validateVariable(key, definition, data[key]);
  }
}

function validateVariable(key: string, definition: { type: string; required?: boolean }, value: unknown): void {
  if (value === undefined || value === null || value === '') {
    if (definition.required) {
      throw new Error(`notification_variable_required:${key}`);
    }
    return;
  }
  if (definition.type === 'number') {
    requireVariableType(key, typeof value === 'number');
    return;
  }
  if (definition.type === 'boolean') {
    requireVariableType(key, typeof value === 'boolean');
    return;
  }
  requireVariableType(key, typeof value === 'string');
  if (typeof value !== 'string') {
    return;
  }
  if (definition.type === 'url' && new URL(value).protocol !== 'https:') {
    throw new Error(`notification_variable_url:${key}`);
  }
  if (definition.type === 'date-time' && Number.isNaN(Date.parse(value))) {
    throw new Error(`notification_variable_date_time:${key}`);
  }
}

function requireVariableType(key: string, valid: boolean): void {
  if (!valid) {
    throw new Error(`notification_variable_type:${key}`);
  }
}

function splitSensitiveVariables(
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

export function mapBroadcastPriority(priority: number): number {
  return Math.min(99, Math.max(1, (priority + 1) * 9));
}
