import type {
  NotificationAudienceMember,
  NotificationAudienceSnapshotRecord,
  NotificationBroadcastRecord,
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationData,
  NotificationDeliveryProvider,
  NotificationSegmentKind,
  NotificationSegmentRecord,
  NotificationSegmentUploadRecord,
  NotificationTemplateAdminRecord,
  NotificationTemplateChannelContent,
  NotificationTemplateEngine,
  NotificationVariablesSchema,
} from '@app/common-notifications';

export interface NotificationTemplateChannelInput {
  channel: NotificationChannel;
  engine?: NotificationTemplateEngine;
  content: NotificationTemplateChannelContent;
}

export interface CreateAdminNotificationTemplateInput {
  tenantId: string;
  code: string;
  name: string;
  description?: string | null;
  variablesSchema?: NotificationVariablesSchema;
  channels: NotificationTemplateChannelInput[];
  actorId: string;
}

export interface UpdateAdminNotificationTemplateInput {
  name?: string;
  description?: string | null;
  variablesSchema?: NotificationVariablesSchema;
  channels?: NotificationTemplateChannelInput[];
  expectedUpdatedAt?: Date;
  actorId: string;
}

export interface CreateNotificationSegmentInput {
  tenantId: string;
  name: string;
  kind: NotificationSegmentKind;
  resolverKey?: string | null;
  parameters?: NotificationData;
  actorId: string;
}

export interface UpdateNotificationSegmentInput {
  name?: string;
  resolverKey?: string | null;
  parameters?: NotificationData;
  actorId: string;
}

export interface CreateNotificationSegmentUploadInput {
  segmentId: string;
  objectKey: string;
  checksum: string;
  actorId: string;
}

export interface ClaimedNotificationSegmentUpload extends NotificationSegmentUploadRecord {
  claimToken: string;
  tenantId: string;
}

export interface CompleteNotificationSegmentUploadInput {
  uploadId: string;
  claimToken: string;
  members: NotificationAudienceMember[];
  totalRows: number;
  duplicateRows: number;
  invalidRows: number;
  errors: string[];
}

export interface CreateNotificationBroadcastInput {
  tenantId: string;
  name: string;
  templateVersionId: string;
  channel: NotificationChannel;
  provider: NotificationDeliveryProvider;
  priority?: number;
  globalVariables?: NotificationData;
  segmentIds: string[];
  actorId: string;
}

export interface UpdateNotificationBroadcastInput {
  name?: string;
  templateVersionId?: string;
  channel?: NotificationChannel;
  provider?: NotificationDeliveryProvider;
  priority?: number;
  globalVariables?: NotificationData;
  segmentIds?: string[];
}

export interface NotificationBroadcastTransitionInput {
  broadcastId: string;
  tenantId: string;
  action: string;
  idempotencyKey: string;
  actorId: string;
  scheduledAt?: Date | null;
  requireIndependentApproval?: boolean;
}

export interface NotificationSnapshotCollectionContext {
  claimToken: string;
  snapshot: NotificationAudienceSnapshotRecord;
  broadcast: NotificationBroadcastRecord;
  segments: NotificationSegmentRecord[];
}

export interface NotificationBroadcastMaterializationContext {
  claimToken: string;
  broadcast: NotificationBroadcastRecord;
  snapshotId: string;
  template: NotificationTemplateAdminRecord;
  members: Array<NotificationAudienceMember & { id: string }>;
}

export interface NotificationSegmentListFilters {
  tenantId: string;
  includeArchived?: boolean;
}

/** Persistence port for admin notification templates, audiences, and broadcasts. */
export abstract class NotificationBroadcastPersistence {
  abstract listTemplates(tenantId: string): Promise<NotificationTemplateAdminRecord[]>;
  abstract getTemplate(id: string, tenantId: string): Promise<NotificationTemplateAdminRecord | null>;
  abstract createAdminTemplate(input: CreateAdminNotificationTemplateInput): Promise<NotificationTemplateAdminRecord>;
  abstract updateAdminTemplate(
    id: string,
    tenantId: string,
    input: UpdateAdminNotificationTemplateInput,
  ): Promise<NotificationTemplateAdminRecord | null>;
  abstract publishAdminTemplate(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<NotificationTemplateAdminRecord | null>;
  abstract archiveAdminTemplate(
    id: string,
    tenantId: string,
    actorId: string,
  ): Promise<NotificationTemplateAdminRecord | null>;

  abstract listSegments(filters: NotificationSegmentListFilters): Promise<NotificationSegmentRecord[]>;
  abstract getSegment(id: string, tenantId: string): Promise<NotificationSegmentRecord | null>;
  abstract createSegment(input: CreateNotificationSegmentInput): Promise<NotificationSegmentRecord>;
  abstract updateSegment(
    id: string,
    tenantId: string,
    input: UpdateNotificationSegmentInput,
  ): Promise<NotificationSegmentRecord | null>;
  abstract archiveSegment(id: string, tenantId: string, actorId: string): Promise<NotificationSegmentRecord | null>;
  abstract createSegmentUpload(input: CreateNotificationSegmentUploadInput): Promise<NotificationSegmentUploadRecord>;
  abstract getSegmentUpload(id: string, tenantId: string): Promise<NotificationSegmentUploadRecord | null>;
  abstract claimSegmentUpload(now: Date): Promise<ClaimedNotificationSegmentUpload | null>;
  abstract completeSegmentUpload(input: CompleteNotificationSegmentUploadInput): Promise<void>;
  abstract failSegmentUpload(uploadId: string, claimToken: string, errors: string[]): Promise<void>;
  abstract listStaticSegmentMembers(segmentId: string): Promise<NotificationAudienceMember[]>;

  abstract listBroadcasts(
    tenantId: string,
    status?: NotificationBroadcastStatus,
  ): Promise<NotificationBroadcastRecord[]>;
  abstract getBroadcast(id: string, tenantId: string): Promise<NotificationBroadcastRecord | null>;
  abstract createBroadcast(input: CreateNotificationBroadcastInput): Promise<NotificationBroadcastRecord>;
  abstract updateBroadcast(
    id: string,
    tenantId: string,
    input: UpdateNotificationBroadcastInput,
  ): Promise<NotificationBroadcastRecord | null>;
  abstract transitionBroadcast(
    input: NotificationBroadcastTransitionInput,
  ): Promise<NotificationBroadcastRecord | null>;
  abstract claimSnapshot(now: Date): Promise<NotificationSnapshotCollectionContext | null>;
  abstract completeSnapshot(
    snapshotId: string,
    claimToken: string,
    members: NotificationAudienceMember[],
  ): Promise<void>;
  abstract failSnapshot(snapshotId: string, claimToken: string, message: string): Promise<void>;
  abstract claimBroadcastMaterialization(limit: number): Promise<NotificationBroadcastMaterializationContext | null>;
  abstract materializeBroadcastMembers(context: NotificationBroadcastMaterializationContext): Promise<number>;
  async materializeNextBroadcastChunk(limit: number): Promise<number> {
    const context = await this.claimBroadcastMaterialization(limit);
    return context ? this.materializeBroadcastMembers(context) : 0;
  }
  abstract activateDueBroadcasts(now: Date): Promise<number>;
  abstract refreshBroadcastStatistics(): Promise<number>;
}
