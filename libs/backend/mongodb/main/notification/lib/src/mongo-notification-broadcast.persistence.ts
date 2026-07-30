import { randomUUID } from 'node:crypto';
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
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationSegmentKind,
  NotificationSegmentStatus,
  NotificationSegmentUploadStatus,
  NotificationStatus,
  NotificationTemplateEngine,
  NotificationTemplateSource,
  NotificationTemplateStatus,
  isNotificationDeliveryChannel,
  isNotificationTemplateChannelContent,
  type NotificationAudienceMember,
  type NotificationAudienceSnapshotRecord,
  type NotificationBroadcastRecord,
  type NotificationData,
  type NotificationDeliveryChannel,
  type NotificationSegmentRecord,
  type NotificationSegmentUploadRecord,
  type NotificationTemplateAdminRecord,
  type NotificationTemplateChannelRecord,
  type NotificationTemplateVersionRecord,
} from '@app/common-notifications';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';
import {
  NotificationMongoCollections,
  type NotificationAudienceSnapshotDocument,
  type NotificationAudienceSnapshotMemberDocument,
  type NotificationBroadcastCommandDocument,
  type NotificationBroadcastDocument,
  type NotificationBroadcastSegmentDocument,
  type NotificationDeliveryDocument,
  type NotificationDocument,
  type NotificationSegmentDocument,
  type NotificationSegmentMemberDocument,
  type NotificationSegmentUploadDocument,
  type NotificationTemplateDocument,
  type NotificationTemplateVersionChannelDocument,
  type NotificationTemplateVersionDocument,
} from './notification-mongo.documents';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';
import { MongoNotificationClaimLeaseMs } from './mongo-notification.persistence';

@Injectable()
export class MongoNotificationBroadcastPersistence extends NotificationBroadcastPersistence {
  private readonly templates: Collection<NotificationTemplateDocument>;
  private readonly versions: Collection<NotificationTemplateVersionDocument>;
  private readonly channels: Collection<NotificationTemplateVersionChannelDocument>;
  private readonly notifications: Collection<NotificationDocument>;
  private readonly deliveries: Collection<NotificationDeliveryDocument>;
  private readonly segments: Collection<NotificationSegmentDocument>;
  private readonly segmentMembers: Collection<NotificationSegmentMemberDocument>;
  private readonly uploads: Collection<NotificationSegmentUploadDocument>;
  private readonly broadcasts: Collection<NotificationBroadcastDocument>;
  private readonly broadcastSegments: Collection<NotificationBroadcastSegmentDocument>;
  private readonly snapshots: Collection<NotificationAudienceSnapshotDocument>;
  private readonly snapshotMembers: Collection<NotificationAudienceSnapshotMemberDocument>;
  private readonly commands: Collection<NotificationBroadcastCommandDocument>;

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
    this.segments = database.collection(NotificationMongoCollections.segments);
    this.segmentMembers = database.collection(NotificationMongoCollections.segmentMembers);
    this.uploads = database.collection(NotificationMongoCollections.segmentUploads);
    this.broadcasts = database.collection(NotificationMongoCollections.broadcasts);
    this.broadcastSegments = database.collection(NotificationMongoCollections.broadcastSegments);
    this.snapshots = database.collection(NotificationMongoCollections.snapshots);
    this.snapshotMembers = database.collection(NotificationMongoCollections.snapshotMembers);
    this.commands = database.collection(NotificationMongoCollections.broadcastCommands);
  }

  async listTemplates(tenantId: string): Promise<NotificationTemplateAdminRecord[]> {
    const templates = await this.templates
      .find({ tenantId: { $in: [tenantId, null] } })
      .sort({ updatedAt: -1 })
      .toArray();
    return Promise.all(templates.map((template) => this.mapTemplate(template)));
  }

  async getTemplate(id: string, tenantId: string): Promise<NotificationTemplateAdminRecord | null> {
    const template = await this.templates.findOne({ _id: id, tenantId: { $in: [tenantId, null] } });
    return template ? this.mapTemplate(template) : null;
  }

  async createAdminTemplate(input: CreateAdminNotificationTemplateInput): Promise<NotificationTemplateAdminRecord> {
    validateChannels(input.channels, true);
    const template = await runInMongoTransaction(this.client, async (session) => {
      if (await this.templates.findOne({ code: input.code }, { session })) {
        throw new Error('notification_template_code_conflict');
      }
      const now = new Date();
      const versionId = randomUUID();
      const templateDocument: NotificationTemplateDocument = {
        _id: randomUUID(),
        tenantId: input.tenantId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        source: NotificationTemplateSource.Admin,
        status: NotificationTemplateStatus.Draft,
        currentVersionId: versionId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now,
      };
      const version: NotificationTemplateVersionDocument = {
        _id: versionId,
        templateId: templateDocument._id,
        version: 1,
        variablesSchema: input.variablesSchema ?? {},
        publishedAt: null,
        publishedBy: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.templates.insertOne(templateDocument, { session });
      await this.versions.insertOne(version, { session });
      await this.channels.insertMany(channelDocuments(version._id, input.channels, now), { session });
      return templateDocument;
    });
    return this.mapTemplate(template);
  }

  async updateAdminTemplate(
    id: string,
    tenantId: string,
    input: UpdateAdminNotificationTemplateInput,
  ): Promise<NotificationTemplateAdminRecord | null> {
    const template = await runInMongoTransaction(this.client, async (session) => {
      let current = await this.templates.findOne({ _id: id, tenantId }, { session });
      if (!current) {
        return null;
      }
      requireMutableAdminTemplate(current);
      if (input.expectedUpdatedAt && current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw new Error('notification_template_stale_write');
      }
      let version = current.currentVersionId
        ? await this.versions.findOne({ _id: current.currentVersionId }, { session })
        : null;
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      if (version.publishedAt) {
        const previousChannels = await this.channels.find({ templateVersionId: version._id }, { session }).toArray();
        const now = new Date();
        version = {
          _id: randomUUID(),
          templateId: current._id,
          version: version.version + 1,
          variablesSchema: version.variablesSchema,
          publishedAt: null,
          publishedBy: null,
          createdAt: now,
          updatedAt: now,
        };
        await this.versions.insertOne(version, { session });
        await this.channels.insertMany(
          previousChannels.map((item) => ({ ...item, _id: randomUUID(), templateVersionId: version?._id ?? '' })),
          { session },
        );
        current = { ...current, currentVersionId: version._id, status: NotificationTemplateStatus.Draft };
      }
      if (input.channels) {
        validateChannels(input.channels, true);
        await this.channels.deleteMany({ templateVersionId: version._id }, { session });
        await this.channels.insertMany(channelDocuments(version._id, input.channels, new Date()), { session });
      }
      const now = new Date();
      await this.versions.updateOne(
        { _id: version._id, publishedAt: null },
        { $set: { variablesSchema: input.variablesSchema ?? version.variablesSchema, updatedAt: now } },
        { session },
      );
      const next = {
        ...current,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedBy: input.actorId,
        updatedAt: now,
      };
      await this.templates.replaceOne({ _id: current._id }, next, { session });
      return next;
    });
    return template ? this.mapTemplate(template) : null;
  }

  async publishAdminTemplate(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<NotificationTemplateAdminRecord | null> {
    const template = await runInMongoTransaction(this.client, async (session) => {
      const current = await this.templates.findOne({ _id: id, tenantId }, { session });
      if (!current) {
        return null;
      }
      requireMutableAdminTemplate(current);
      const version = current.currentVersionId
        ? await this.versions.findOne({ _id: current.currentVersionId }, { session })
        : null;
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      if (!version.publishedAt) {
        validateChannels(await this.channels.find({ templateVersionId: version._id }, { session }).toArray(), true);
        const publishedAt = new Date();
        await this.versions.updateOne(
          { _id: version._id, publishedAt: null },
          { $set: { publishedAt, publishedBy: actorId, updatedAt: publishedAt } },
          { session },
        );
      }
      const updatedAt = new Date();
      const next = { ...current, status: NotificationTemplateStatus.Published, updatedBy: actorId, updatedAt };
      await this.templates.replaceOne({ _id: current._id }, next, { session });
      return next;
    });
    return template ? this.mapTemplate(template) : null;
  }

  async archiveAdminTemplate(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<NotificationTemplateAdminRecord | null> {
    const current = await this.templates.findOne({ _id: id, tenantId });
    if (!current) {
      return null;
    }
    if (current.source !== NotificationTemplateSource.Admin) {
      throw new Error('notification_template_code_owned');
    }
    const updatedAt = new Date();
    const updated = await this.templates.findOneAndUpdate(
      { _id: id, tenantId, source: NotificationTemplateSource.Admin },
      { $set: { status: NotificationTemplateStatus.Archived, updatedBy: actorId, updatedAt } },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return updated ? this.mapTemplate(updated) : null;
  }

  async listSegments(filters: NotificationSegmentListFilters): Promise<NotificationSegmentRecord[]> {
    return (
      await this.segments
        .find({
          tenantId: filters.tenantId,
          ...(filters.includeArchived ? {} : { status: NotificationSegmentStatus.Active }),
        })
        .sort({ updatedAt: -1 })
        .toArray()
    ).map(mapSegment);
  }

  async getSegment(id: string, tenantId: string): Promise<NotificationSegmentRecord | null> {
    const segment = await this.segments.findOne({ _id: id, tenantId });
    return segment ? mapSegment(segment) : null;
  }

  async createSegment(input: CreateNotificationSegmentInput): Promise<NotificationSegmentRecord> {
    if (input.kind === NotificationSegmentKind.Dynamic && !input.resolverKey) {
      throw new Error('notification_segment_resolver_required');
    }
    const now = new Date();
    const segment: NotificationSegmentDocument = {
      _id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      kind: input.kind,
      resolverKey: input.resolverKey ?? null,
      parameters: input.parameters ?? {},
      status: NotificationSegmentStatus.Active,
      memberCount: 0,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.segments.insertOne(segment);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new Error('notification_segment_name_conflict', { cause: error });
      }
      throw error;
    }
    return mapSegment(segment);
  }

  async updateSegment(
    id: string,
    tenantId: string,
    input: UpdateNotificationSegmentInput,
  ): Promise<NotificationSegmentRecord | null> {
    const existing = await this.segments.findOne({ _id: id, tenantId });
    if (!existing) {
      return null;
    }
    if (existing.status === NotificationSegmentStatus.Archived) {
      throw new Error('notification_segment_archived');
    }
    const updated = await this.segments.findOneAndUpdate(
      { _id: id, tenantId, status: NotificationSegmentStatus.Active },
      {
        $set: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.resolverKey !== undefined ? { resolverKey: input.resolverKey } : {}),
          ...(input.parameters !== undefined ? { parameters: input.parameters } : {}),
          updatedBy: input.actorId,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return updated ? mapSegment(updated) : null;
  }

  async archiveSegment(id: string, tenantId: string, actorId: string): Promise<NotificationSegmentRecord | null> {
    const updated = await this.segments.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { status: NotificationSegmentStatus.Archived, updatedBy: actorId, updatedAt: new Date() } },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return updated ? mapSegment(updated) : null;
  }

  async createSegmentUpload(input: CreateNotificationSegmentUploadInput): Promise<NotificationSegmentUploadRecord> {
    const now = new Date();
    const upload = await this.uploads.findOneAndUpdate(
      { segmentId: input.segmentId, checksum: input.checksum },
      {
        $setOnInsert: {
          _id: randomUUID(),
          segmentId: input.segmentId,
          objectKey: input.objectKey,
          checksum: input.checksum,
          status: NotificationSegmentUploadStatus.Pending,
          totalRows: 0,
          validRows: 0,
          duplicateRows: 0,
          invalidRows: 0,
          errors: [],
          claimToken: null,
          claimExpiresAt: null,
          createdBy: input.actorId,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!upload) {
      throw new Error('notification_segment_upload_create_failed');
    }
    return mapUpload(upload);
  }

  async getSegmentUpload(id: string, tenantId: string): Promise<NotificationSegmentUploadRecord | null> {
    const upload = await this.uploads.findOne({ _id: id });
    if (!upload || !(await this.segments.findOne({ _id: upload.segmentId, tenantId }))) {
      return null;
    }
    return mapUpload(upload);
  }

  async claimSegmentUpload(now: Date): Promise<ClaimedNotificationSegmentUpload | null> {
    const claimToken = randomUUID();
    const upload = await this.uploads.findOneAndUpdate(
      {
        status: { $in: [NotificationSegmentUploadStatus.Pending, NotificationSegmentUploadStatus.Processing] },
        $or: [{ claimExpiresAt: null }, { claimExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: NotificationSegmentUploadStatus.Processing,
          claimToken,
          claimExpiresAt: new Date(now.getTime() + MongoNotificationClaimLeaseMs),
          updatedAt: now,
        },
      },
      { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!upload) {
      return null;
    }
    const segment = await this.segments.findOne({ _id: upload.segmentId });
    return segment ? { ...mapUpload(upload), claimToken, tenantId: segment.tenantId } : null;
  }

  async completeSegmentUpload(input: CompleteNotificationSegmentUploadInput): Promise<void> {
    await runInMongoTransaction(this.client, async (session) => {
      const upload = await this.uploads.findOne(
        { _id: input.uploadId, claimToken: input.claimToken, status: NotificationSegmentUploadStatus.Processing },
        { session },
      );
      if (!upload) {
        return;
      }
      const segment = await this.segments.findOne({ _id: upload.segmentId }, { session });
      if (!segment) {
        return;
      }
      await this.segmentMembers.deleteMany({ segmentId: segment._id }, { session });
      const now = new Date();
      if (input.members.length > 0) {
        await this.segmentMembers.insertMany(
          input.members.map((member) => ({
            _id: randomUUID(),
            segmentId: segment._id,
            targetType: member.targetType,
            targetId: member.targetId,
            language: member.language ?? null,
            variables: member.variables ?? {},
            createdAt: now,
          })),
          { session },
        );
      }
      await this.segments.updateOne(
        { _id: segment._id },
        { $set: { memberCount: input.members.length, updatedAt: now } },
        { session },
      );
      await this.uploads.updateOne(
        { _id: input.uploadId, claimToken: input.claimToken },
        {
          $set: {
            status: NotificationSegmentUploadStatus.Completed,
            totalRows: input.totalRows,
            validRows: input.members.length,
            duplicateRows: input.duplicateRows,
            invalidRows: input.invalidRows,
            errors: input.errors.slice(0, 100),
            claimToken: null,
            claimExpiresAt: null,
            updatedAt: now,
          },
        },
        { session },
      );
    });
  }

  async failSegmentUpload(uploadId: string, claimToken: string, errors: string[]): Promise<void> {
    await this.uploads.updateOne(
      { _id: uploadId, claimToken, status: NotificationSegmentUploadStatus.Processing },
      {
        $set: {
          status: NotificationSegmentUploadStatus.Failed,
          errors: errors.slice(0, 100),
          claimToken: null,
          claimExpiresAt: null,
          updatedAt: new Date(),
        },
      },
    );
  }

  async listStaticSegmentMembers(segmentId: string): Promise<NotificationAudienceMember[]> {
    return (await this.segmentMembers.find({ segmentId }).sort({ _id: 1 }).toArray()).map(mapAudienceMember);
  }

  async listBroadcasts(tenantId: string, status?: NotificationBroadcastStatus): Promise<NotificationBroadcastRecord[]> {
    const broadcasts = await this.broadcasts
      .find({ tenantId, ...(status ? { status } : {}) })
      .sort({ createdAt: -1 })
      .toArray();
    return Promise.all(broadcasts.map((broadcast) => this.mapBroadcast(broadcast)));
  }

  async getBroadcast(id: string, tenantId: string): Promise<NotificationBroadcastRecord | null> {
    const broadcast = await this.broadcasts.findOne({ _id: id, tenantId });
    return broadcast ? this.mapBroadcast(broadcast) : null;
  }

  async createBroadcast(input: CreateNotificationBroadcastInput): Promise<NotificationBroadcastRecord> {
    validateBroadcastInput(input.channel, input.provider, input.priority ?? 0);
    const broadcast = await runInMongoTransaction(this.client, async (session) => {
      await this.requirePublishedVersion(input.templateVersionId, input.tenantId, session);
      await this.requireSegments(input.segmentIds, input.tenantId, session);
      const now = new Date();
      const document: NotificationBroadcastDocument = {
        _id: randomUUID(),
        tenantId: input.tenantId,
        name: input.name,
        templateVersionId: input.templateVersionId,
        channel: input.channel as NotificationDeliveryChannel,
        provider: input.provider,
        priority: input.priority ?? 0,
        status: NotificationBroadcastStatus.Draft,
        scheduledAt: null,
        globalVariables: input.globalVariables ?? {},
        snapshotCount: 0,
        queuedCount: 0,
        sentCount: 0,
        rejectedCount: 0,
        errorCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        materializedAt: null,
        materializationClaimToken: null,
        materializationClaimExpiresAt: null,
        createdBy: input.actorId,
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.broadcasts.insertOne(document, { session });
      await this.broadcastSegments.insertMany(
        [...new Set(input.segmentIds)].map((segmentId) => ({
          _id: randomUUID(),
          broadcastId: document._id,
          segmentId,
        })),
        { session },
      );
      return document;
    });
    return this.mapBroadcast(broadcast);
  }

  async updateBroadcast(
    id: string,
    tenantId: string,
    input: UpdateNotificationBroadcastInput,
  ): Promise<NotificationBroadcastRecord | null> {
    const broadcast = await runInMongoTransaction(this.client, async (session) => {
      const current = await this.broadcasts.findOne({ _id: id, tenantId }, { session });
      if (!current) {
        return null;
      }
      if (current.status !== NotificationBroadcastStatus.Draft) {
        throw new Error('notification_broadcast_not_draft');
      }
      const channel = input.channel ?? current.channel;
      const provider = input.provider ?? current.provider;
      validateBroadcastInput(channel, provider, input.priority ?? current.priority);
      if (input.templateVersionId) {
        await this.requirePublishedVersion(input.templateVersionId, tenantId, session);
      }
      if (input.segmentIds) {
        await this.requireSegments(input.segmentIds, tenantId, session);
        await this.broadcastSegments.deleteMany({ broadcastId: id }, { session });
        await this.broadcastSegments.insertMany(
          [...new Set(input.segmentIds)].map((segmentId) => ({ _id: randomUUID(), broadcastId: id, segmentId })),
          { session },
        );
      }
      const next: NotificationBroadcastDocument = {
        ...current,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.templateVersionId !== undefined ? { templateVersionId: input.templateVersionId } : {}),
        ...(input.channel !== undefined ? { channel: input.channel as NotificationDeliveryChannel } : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.globalVariables !== undefined ? { globalVariables: input.globalVariables } : {}),
        updatedAt: new Date(),
      };
      await this.broadcasts.replaceOne({ _id: id, status: NotificationBroadcastStatus.Draft }, next, { session });
      return next;
    });
    return broadcast ? this.mapBroadcast(broadcast) : null;
  }

  async transitionBroadcast(input: NotificationBroadcastTransitionInput): Promise<NotificationBroadcastRecord | null> {
    try {
      const broadcast = await runInMongoTransaction(this.client, async (session) => {
        const current = await this.broadcasts.findOne(
          { _id: input.broadcastId, tenantId: input.tenantId },
          { session },
        );
        if (!current) {
          return null;
        }
        if (
          await this.commands.findOne(
            { broadcastId: current._id, action: input.action, idempotencyKey: input.idempotencyKey },
            { session },
          )
        ) {
          return current;
        }
        const next = await this.applyTransition(current, input, session);
        await this.commands.insertOne(
          {
            _id: randomUUID(),
            broadcastId: current._id,
            action: input.action,
            idempotencyKey: input.idempotencyKey,
            actorId: input.actorId,
            createdAt: new Date(),
          },
          { session },
        );
        const committed = { ...next, updatedAt: new Date() };
        await this.broadcasts.replaceOne({ _id: current._id }, committed, { session });
        return committed;
      });
      return broadcast ? this.mapBroadcast(broadcast) : null;
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      return this.getBroadcast(input.broadcastId, input.tenantId);
    }
  }

  async claimSnapshot(now: Date): Promise<NotificationSnapshotCollectionContext | null> {
    const claimToken = randomUUID();
    const snapshot = await this.snapshots.findOneAndUpdate(
      {
        status: { $in: [NotificationAudienceSnapshotStatus.Created, NotificationAudienceSnapshotStatus.Collecting] },
        $or: [{ claimExpiresAt: null }, { claimExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: NotificationAudienceSnapshotStatus.Collecting,
          claimToken,
          claimExpiresAt: new Date(now.getTime() + MongoNotificationClaimLeaseMs),
          updatedAt: now,
        },
      },
      { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!snapshot) {
      return null;
    }
    const broadcast = await this.broadcasts.findOne({
      _id: snapshot.broadcastId,
      status: NotificationBroadcastStatus.Collecting,
    });
    if (!broadcast) {
      return null;
    }
    const links = await this.broadcastSegments.find({ broadcastId: broadcast._id }).toArray();
    const segments = await this.segments
      .find({ _id: { $in: links.map((link) => link.segmentId) }, status: NotificationSegmentStatus.Active })
      .toArray();
    return {
      claimToken,
      snapshot: mapSnapshot(snapshot),
      broadcast: await this.mapBroadcast(broadcast),
      segments: segments.map(mapSegment),
    };
  }

  async completeSnapshot(snapshotId: string, claimToken: string, members: NotificationAudienceMember[]): Promise<void> {
    await runInMongoTransaction(this.client, async (session) => {
      const snapshot = await this.snapshots.findOne(
        { _id: snapshotId, claimToken, status: NotificationAudienceSnapshotStatus.Collecting },
        { session },
      );
      if (!snapshot) {
        return;
      }
      const broadcast = await this.broadcasts.findOne({ _id: snapshot.broadcastId }, { session });
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
      const now = new Date();
      if (conflicts === 0 && unique.size > 0) {
        await this.snapshotMembers.insertMany(
          [...unique.values()].map((member) => ({
            _id: randomUUID(),
            snapshotId,
            targetType: member.targetType,
            targetId: member.targetId,
            language: member.language ?? null,
            variables: member.variables ?? {},
            materializedAt: null,
            createdAt: now,
          })),
          { session },
        );
      }
      await this.snapshots.updateOne(
        { _id: snapshotId, claimToken },
        {
          $set: {
            resolvedCount: members.length,
            distinctCount: unique.size,
            duplicateCount: duplicates,
            conflictCount: conflicts,
            status:
              conflicts > 0 ? NotificationAudienceSnapshotStatus.Failed : NotificationAudienceSnapshotStatus.Completed,
            error:
              conflicts > 0
                ? { reason: NotificationErrorReason.InvalidRecipient, message: 'Audience variable conflict.' }
                : null,
            claimToken: null,
            claimExpiresAt: null,
            updatedAt: now,
          },
        },
        { session },
      );
      await this.broadcasts.updateOne(
        { _id: broadcast._id },
        {
          $set: {
            status: conflicts > 0 ? NotificationBroadcastStatus.Failed : NotificationBroadcastStatus.Ready,
            snapshotCount: conflicts > 0 ? broadcast.snapshotCount : unique.size,
            updatedAt: now,
          },
        },
        { session },
      );
    });
  }

  async failSnapshot(snapshotId: string, claimToken: string, message: string): Promise<void> {
    await runInMongoTransaction(this.client, async (session) => {
      const snapshot = await this.snapshots.findOne(
        { _id: snapshotId, claimToken, status: NotificationAudienceSnapshotStatus.Collecting },
        { session },
      );
      if (!snapshot) {
        return;
      }
      const now = new Date();
      await this.snapshots.updateOne(
        { _id: snapshotId, claimToken },
        {
          $set: {
            status: NotificationAudienceSnapshotStatus.Failed,
            error: { reason: NotificationErrorReason.UnknownError, message: message.slice(0, 500) },
            claimToken: null,
            claimExpiresAt: null,
            updatedAt: now,
          },
        },
        { session },
      );
      await this.broadcasts.updateOne(
        { _id: snapshot.broadcastId },
        { $set: { status: NotificationBroadcastStatus.Failed, updatedAt: now } },
        { session },
      );
    });
  }

  async claimBroadcastMaterialization(limit: number): Promise<NotificationBroadcastMaterializationContext | null> {
    const now = new Date();
    const claimToken = randomUUID();
    const broadcast = await this.broadcasts.findOneAndUpdate(
      {
        status: NotificationBroadcastStatus.Sending,
        materializedAt: null,
        $or: [{ materializationClaimExpiresAt: null }, { materializationClaimExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          materializationClaimToken: claimToken,
          materializationClaimExpiresAt: new Date(now.getTime() + MongoNotificationClaimLeaseMs),
          updatedAt: now,
        },
      },
      { sort: { updatedAt: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!broadcast) {
      return null;
    }
    const snapshot = await this.snapshots.findOne({
      broadcastId: broadcast._id,
      status: NotificationAudienceSnapshotStatus.Completed,
    });
    if (!snapshot) {
      return null;
    }
    const members = await this.snapshotMembers
      .find({ snapshotId: snapshot._id, materializedAt: null })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
    if (members.length === 0) {
      await this.broadcasts.updateOne(
        { _id: broadcast._id, materializationClaimToken: claimToken },
        {
          $set: {
            materializedAt: now,
            materializationClaimToken: null,
            materializationClaimExpiresAt: null,
            updatedAt: now,
          },
        },
      );
      return null;
    }
    const version = await this.versions.findOne({ _id: broadcast.templateVersionId });
    if (!version) {
      throw new Error('notification_template_version_missing');
    }
    const template = await this.templates.findOne({ _id: version.templateId });
    if (!template) {
      throw new Error('notification_template_missing');
    }
    return {
      claimToken,
      broadcast: await this.mapBroadcast(broadcast),
      snapshotId: snapshot._id,
      template: await this.mapTemplate(template),
      members: members.map((member) => ({ id: member._id, ...mapAudienceMember(member) })),
    };
  }

  async materializeBroadcastMembers(context: NotificationBroadcastMaterializationContext): Promise<number> {
    return runInMongoTransaction(this.client, async (session) => {
      const broadcast = await this.broadcasts.findOne(
        {
          _id: context.broadcast.id,
          status: NotificationBroadcastStatus.Sending,
          materializationClaimToken: context.claimToken,
        },
        { session },
      );
      if (!broadcast) {
        return 0;
      }
      const version = await this.versions.findOne({ _id: broadcast.templateVersionId }, { session });
      if (!version) {
        throw new Error('notification_template_version_missing');
      }
      const template = await this.templates.findOne({ _id: version.templateId }, { session });
      if (!template) {
        throw new Error('notification_template_missing');
      }
      const ids = context.members.map((member) => member.id);
      const members = await this.snapshotMembers
        .find({ _id: { $in: ids }, snapshotId: context.snapshotId, materializedAt: null }, { session })
        .toArray();
      const existing = await this.notifications
        .find(
          {
            broadcastId: broadcast._id,
            $or: members.map((member) => ({ targetType: member.targetType, targetId: member.targetId })),
          },
          { session },
        )
        .toArray();
      const targets = new Set(existing.map((item) => `${item.targetType}:${item.targetId}`));
      const now = new Date();
      let created = 0;
      for (const member of members) {
        const key = `${member.targetType}:${member.targetId}`;
        if (!targets.has(key)) {
          const variables = { ...broadcast.globalVariables, ...member.variables };
          validateVariables(version.variablesSchema, variables);
          const [data, sensitive] = splitSensitiveVariables(version.variablesSchema, variables);
          const notification: NotificationDocument = {
            _id: randomUUID(),
            targetType: member.targetType,
            targetId: member.targetId,
            templateId: template._id,
            templateVersionId: version._id,
            broadcastId: broadcast._id,
            data,
            sensitiveData: null,
            extra: member.language ? { useLanguage: member.language } : null,
            inAppVisible: false,
            createdAt: now,
          };
          if (Object.keys(sensitive).length > 0) {
            notification.sensitiveData = this.payloadCrypto.encrypt(
              sensitive,
              `notification:${notification._id}:${notification.targetType}:${notification.targetId}`,
            );
          }
          // eslint-disable-next-line no-await-in-loop
          await this.notifications.insertOne(notification, { session });
          // eslint-disable-next-line no-await-in-loop
          await this.deliveries.insertOne(
            {
              _id: randomUUID(),
              notificationId: notification._id,
              targetType: member.targetType,
              targetId: member.targetId,
              channel: broadcast.channel,
              status: NotificationStatus.Pending,
              error: null,
              attempts: 0,
              provider: broadcast.provider,
              broadcastId: broadcast._id,
              priority: mapBroadcastPriority(broadcast.priority),
              sendAfter: now,
              sentAt: null,
              dispatchStartedAt: null,
              claimToken: null,
              claimExpiresAt: null,
              createdAt: now,
              updatedAt: now,
            },
            { session },
          );
          targets.add(key);
          created += 1;
        }
      }
      if (ids.length > 0) {
        await this.snapshotMembers.updateMany(
          { _id: { $in: ids }, materializedAt: null },
          { $set: { materializedAt: now } },
          { session },
        );
      }
      await this.broadcasts.updateOne(
        { _id: broadcast._id, materializationClaimToken: context.claimToken },
        {
          $inc: { queuedCount: created, pendingCount: created },
          $set: { materializationClaimToken: null, materializationClaimExpiresAt: null, updatedAt: now },
        },
        { session },
      );
      return created;
    });
  }

  async activateDueBroadcasts(now: Date): Promise<number> {
    return (
      await this.broadcasts.updateMany(
        { status: NotificationBroadcastStatus.Scheduled, scheduledAt: { $lte: now } },
        { $set: { status: NotificationBroadcastStatus.Sending, updatedAt: now } },
      )
    ).modifiedCount;
  }

  async refreshBroadcastStatistics(): Promise<number> {
    const broadcasts = await this.broadcasts
      .find({ status: { $in: [NotificationBroadcastStatus.Sending, NotificationBroadcastStatus.Paused] } })
      .toArray();
    await Promise.all(
      broadcasts.map(async (broadcast) => {
        const counts = await this.deliveries
          .aggregate<{ _id: NotificationStatus; count: number }>([
            { $match: { broadcastId: broadcast._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .toArray();
        const count = (status: NotificationStatus) => counts.find((item) => item._id === status)?.count ?? 0;
        const queuedCount = counts.reduce((sum, item) => sum + item.count, 0);
        const pendingCount = count(NotificationStatus.Pending) + count(NotificationStatus.Paused);
        const status =
          broadcast.status === NotificationBroadcastStatus.Sending && broadcast.materializedAt && pendingCount === 0
            ? NotificationBroadcastStatus.Completed
            : broadcast.status;
        await this.broadcasts.updateOne(
          { _id: broadcast._id, status: broadcast.status },
          {
            $set: {
              queuedCount,
              sentCount: count(NotificationStatus.Sent),
              rejectedCount: count(NotificationStatus.Rejected),
              errorCount: count(NotificationStatus.Error),
              pendingCount,
              cancelledCount: count(NotificationStatus.Cancelled),
              status,
              updatedAt: new Date(),
            },
          },
        );
      }),
    );
    return broadcasts.length;
  }

  // The explicit branches mirror the public transition state machine and keep every related write in this transaction.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  private async applyTransition(
    broadcast: NotificationBroadcastDocument,
    input: NotificationBroadcastTransitionInput,
    session: ClientSession,
  ): Promise<NotificationBroadcastDocument> {
    if (input.action === 'collect-audience') {
      requireState(broadcast, [NotificationBroadcastStatus.Draft]);
      if ((await this.broadcastSegments.countDocuments({ broadcastId: broadcast._id }, { session })) === 0) {
        throw new Error('notification_broadcast_empty_audience');
      }
      const now = new Date();
      await this.snapshots.insertOne(
        {
          _id: randomUUID(),
          broadcastId: broadcast._id,
          snapshotAt: now,
          status: NotificationAudienceSnapshotStatus.Created,
          resolvedCount: 0,
          distinctCount: 0,
          duplicateCount: 0,
          conflictCount: 0,
          invalidCount: 0,
          error: null,
          claimToken: null,
          claimExpiresAt: null,
          createdAt: now,
          updatedAt: now,
        },
        { session },
      );
      return { ...broadcast, status: NotificationBroadcastStatus.Collecting };
    }
    if (input.action === 'approve') {
      requireState(broadcast, [NotificationBroadcastStatus.Ready]);
      if (broadcast.createdBy === input.actorId) {
        throw new Error('notification_broadcast_independent_approval_required');
      }
      return { ...broadcast, approvedBy: input.actorId };
    }
    if (input.action === 'send' || input.action === 'schedule') {
      requireState(broadcast, [NotificationBroadcastStatus.Ready]);
      if (input.requireIndependentApproval && !broadcast.approvedBy) {
        throw new Error('notification_broadcast_approval_required');
      }
      if (input.action === 'schedule') {
        if (!input.scheduledAt || input.scheduledAt <= new Date()) {
          throw new Error('notification_broadcast_invalid_schedule');
        }
        return { ...broadcast, scheduledAt: input.scheduledAt, status: NotificationBroadcastStatus.Scheduled };
      }
      return { ...broadcast, status: NotificationBroadcastStatus.Sending };
    }
    if (input.action === 'pause' || input.action === 'resume') {
      const pausing = input.action === 'pause';
      requireState(broadcast, [pausing ? NotificationBroadcastStatus.Sending : NotificationBroadcastStatus.Paused]);
      await this.deliveries.updateMany(
        { broadcastId: broadcast._id, status: pausing ? NotificationStatus.Pending : NotificationStatus.Paused },
        {
          $set: {
            status: pausing ? NotificationStatus.Paused : NotificationStatus.Pending,
            claimToken: null,
            claimExpiresAt: null,
            updatedAt: new Date(),
          },
        },
        { session },
      );
      return {
        ...broadcast,
        status: pausing ? NotificationBroadcastStatus.Paused : NotificationBroadcastStatus.Sending,
      };
    }
    if (input.action === 'cancel') {
      requireState(broadcast, [
        NotificationBroadcastStatus.Draft,
        NotificationBroadcastStatus.Ready,
        NotificationBroadcastStatus.Scheduled,
        NotificationBroadcastStatus.Sending,
        NotificationBroadcastStatus.Paused,
      ]);
      await this.deliveries.updateMany(
        { broadcastId: broadcast._id, status: { $in: [NotificationStatus.Pending, NotificationStatus.Paused] } },
        {
          $set: {
            status: NotificationStatus.Cancelled,
            claimToken: null,
            claimExpiresAt: null,
            updatedAt: new Date(),
          },
        },
        { session },
      );
      return { ...broadcast, status: NotificationBroadcastStatus.Cancelled };
    }
    throw new Error('notification_broadcast_unknown_action');
  }

  private async requirePublishedVersion(versionId: string, tenantId: string, session: ClientSession): Promise<void> {
    const version = await this.versions.findOne({ _id: versionId, publishedAt: { $ne: null } }, { session });
    if (!version) {
      throw new Error('notification_template_version_not_published');
    }
    const template = await this.templates.findOne(
      { _id: version.templateId, status: NotificationTemplateStatus.Published, tenantId: { $in: [tenantId, null] } },
      { session },
    );
    if (!template) {
      throw new Error('notification_template_not_available');
    }
  }

  private async requireSegments(ids: string[], tenantId: string, session: ClientSession): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      throw new Error('notification_broadcast_empty_audience');
    }
    if (
      (await this.segments.countDocuments(
        { _id: { $in: unique }, tenantId, status: NotificationSegmentStatus.Active },
        { session },
      )) !== unique.length
    ) {
      throw new Error('notification_broadcast_segment_not_available');
    }
  }

  private async mapTemplate(template: NotificationTemplateDocument): Promise<NotificationTemplateAdminRecord> {
    const versions = await this.versions.find({ templateId: template._id }).sort({ version: -1 }).toArray();
    const channels =
      versions.length > 0
        ? await this.channels.find({ templateVersionId: { $in: versions.map((version) => version._id) } }).toArray()
        : [];
    return {
      id: template._id,
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

  private async mapBroadcast(document: NotificationBroadcastDocument): Promise<NotificationBroadcastRecord> {
    const [links, snapshot] = await Promise.all([
      this.broadcastSegments.find({ broadcastId: document._id }).sort({ _id: 1 }).toArray(),
      this.snapshots.find({ broadcastId: document._id }).sort({ createdAt: -1 }).limit(1).next(),
    ]);
    return {
      id: document._id,
      tenantId: document.tenantId,
      name: document.name,
      templateVersionId: document.templateVersionId,
      channel: document.channel,
      provider: document.provider,
      priority: document.priority,
      status: document.status,
      scheduledAt: document.scheduledAt,
      globalVariables: document.globalVariables,
      segmentIds: links.map((link) => link.segmentId),
      snapshot: snapshot ? mapSnapshot(snapshot) : null,
      snapshotCount: document.snapshotCount,
      queuedCount: document.queuedCount,
      sentCount: document.sentCount,
      rejectedCount: document.rejectedCount,
      errorCount: document.errorCount,
      pendingCount: document.pendingCount,
      cancelledCount: document.cancelledCount,
      materializedAt: document.materializedAt,
      createdBy: document.createdBy,
      approvedBy: document.approvedBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

function validateChannels(channels: NotificationTemplateChannelInput[], admin: boolean): void {
  if (channels.length === 0) {
    throw new Error('notification_template_channel_required');
  }
  if (new Set(channels.map((item) => item.channel)).size !== channels.length) {
    throw new Error('notification_template_channel_duplicate');
  }
  for (const item of channels) {
    if (!isNotificationTemplateChannelContent(item.channel, item.content)) {
      throw new Error('notification_template_channel_invalid');
    }
    if (admin && item.engine === NotificationTemplateEngine.Eta) {
      throw new Error('notification_template_eta_forbidden');
    }
  }
}

function requireMutableAdminTemplate(template: NotificationTemplateDocument): void {
  if (template.source !== NotificationTemplateSource.Admin) {
    throw new Error('notification_template_code_owned');
  }
  if (template.status === NotificationTemplateStatus.Archived) {
    throw new Error('notification_template_archived');
  }
}

function channelDocuments(
  versionId: string,
  channels: NotificationTemplateChannelInput[],
  createdAt: Date,
): NotificationTemplateVersionChannelDocument[] {
  return channels.map((item) => ({
    _id: randomUUID(),
    templateVersionId: versionId,
    channel: item.channel,
    engine: item.engine ?? NotificationTemplateEngine.StringFormat,
    content: item.content,
    createdAt,
  }));
}

function mapVersion(
  version: NotificationTemplateVersionDocument,
  allChannels: NotificationTemplateVersionChannelDocument[],
): NotificationTemplateVersionRecord {
  const channels: Partial<Record<NotificationChannel, NotificationTemplateChannelRecord>> = {};
  for (const item of allChannels.filter((channel) => channel.templateVersionId === version._id)) {
    channels[item.channel] = { id: item._id, channel: item.channel, engine: item.engine, content: item.content };
  }
  return {
    id: version._id,
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

function mapSegment(document: NotificationSegmentDocument): NotificationSegmentRecord {
  return {
    id: document._id,
    tenantId: document.tenantId,
    name: document.name,
    kind: document.kind,
    resolverKey: document.resolverKey,
    parameters: document.parameters,
    status: document.status,
    memberCount: document.memberCount,
    createdBy: document.createdBy,
    updatedBy: document.updatedBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function mapUpload(document: NotificationSegmentUploadDocument): NotificationSegmentUploadRecord {
  return {
    id: document._id,
    segmentId: document.segmentId,
    objectKey: document.objectKey,
    checksum: document.checksum,
    status: document.status,
    totalRows: document.totalRows,
    validRows: document.validRows,
    duplicateRows: document.duplicateRows,
    invalidRows: document.invalidRows,
    errors: document.errors,
    createdBy: document.createdBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function mapSnapshot(document: NotificationAudienceSnapshotDocument): NotificationAudienceSnapshotRecord {
  return {
    id: document._id,
    broadcastId: document.broadcastId,
    snapshotAt: document.snapshotAt,
    status: document.status,
    resolvedCount: document.resolvedCount,
    distinctCount: document.distinctCount,
    duplicateCount: document.duplicateCount,
    conflictCount: document.conflictCount,
    invalidCount: document.invalidCount,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function mapAudienceMember(
  document: NotificationSegmentMemberDocument | NotificationAudienceSnapshotMemberDocument,
): NotificationAudienceMember {
  return {
    targetType: document.targetType,
    targetId: document.targetId,
    ...(document.language ? { language: document.language } : {}),
    ...(Object.keys(document.variables).length > 0 ? { variables: document.variables } : {}),
  };
}

function validateBroadcastInput(
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

function requireState(broadcast: NotificationBroadcastDocument, allowed: NotificationBroadcastStatus[]): void {
  if (!allowed.includes(broadcast.status)) {
    throw new Error('notification_broadcast_state_conflict');
  }
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

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
