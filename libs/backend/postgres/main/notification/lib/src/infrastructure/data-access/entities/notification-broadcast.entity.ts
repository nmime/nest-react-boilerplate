import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  NotificationAudienceSnapshotStatus,
  NotificationBroadcastStatus,
  NotificationChannel,
  type NotificationData,
  NotificationDeliveryProvider,
  type NotificationError,
  NotificationTargetType,
} from '@app/common-notifications';

export class NotificationBroadcastEntity {
  id: string = randomUUID();
  tenantId!: string;
  name!: string;
  templateVersionId!: string;
  channel: NotificationChannel = NotificationChannel.Bot;
  provider: NotificationDeliveryProvider = NotificationDeliveryProvider.TelegramBot;
  priority = 0;
  status: NotificationBroadcastStatus = NotificationBroadcastStatus.Draft;
  scheduledAt: Date | null = null;
  globalVariables: NotificationData = {};
  snapshotCount = 0;
  queuedCount = 0;
  sentCount = 0;
  rejectedCount = 0;
  errorCount = 0;
  pendingCount = 0;
  cancelledCount = 0;
  materializedAt: Date | null = null;
  createdBy!: string;
  approvedBy: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: Partial<NotificationBroadcastEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationBroadcastEntitySchema = new EntitySchema<NotificationBroadcastEntity>({
  class: NotificationBroadcastEntity,
  tableName: 'notification_broadcasts',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id' },
    name: { type: 'varchar', length: 160 },
    templateVersionId: { type: 'uuid', fieldName: 'template_version_id' },
    channel: { type: 'varchar', length: 32, default: NotificationChannel.Bot },
    provider: { type: 'varchar', length: 32, default: NotificationDeliveryProvider.TelegramBot },
    priority: { type: 'smallint', default: 0 },
    status: { type: 'varchar', length: 16, default: NotificationBroadcastStatus.Draft },
    scheduledAt: { type: 'timestamptz', fieldName: 'scheduled_at', nullable: true, default: null },
    globalVariables: { type: 'json', fieldName: 'global_variables', defaultRaw: "'{}'::jsonb" },
    snapshotCount: { type: 'integer', fieldName: 'snapshot_count', default: 0 },
    queuedCount: { type: 'integer', fieldName: 'queued_count', default: 0 },
    sentCount: { type: 'integer', fieldName: 'sent_count', default: 0 },
    rejectedCount: { type: 'integer', fieldName: 'rejected_count', default: 0 },
    errorCount: { type: 'integer', fieldName: 'error_count', default: 0 },
    pendingCount: { type: 'integer', fieldName: 'pending_count', default: 0 },
    cancelledCount: { type: 'integer', fieldName: 'cancelled_count', default: 0 },
    materializedAt: { type: 'timestamptz', fieldName: 'materialized_at', nullable: true, default: null },
    createdBy: { type: 'varchar', fieldName: 'created_by', length: 160 },
    approvedBy: { type: 'varchar', fieldName: 'approved_by', length: 160, nullable: true, default: null },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    {
      name: 'ix__notification_broadcasts__tenant_id_status_created_at',
      properties: ['tenantId', 'status', 'createdAt'],
    },
    { name: 'ix__notification_broadcasts__status_scheduled_at', properties: ['status', 'scheduledAt'] },
  ],
});

export class NotificationBroadcastSegmentEntity {
  id: string = randomUUID();
  broadcastId!: string;
  segmentId!: string;

  constructor(input?: Partial<NotificationBroadcastSegmentEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationBroadcastSegmentEntitySchema = new EntitySchema<NotificationBroadcastSegmentEntity>({
  class: NotificationBroadcastSegmentEntity,
  tableName: 'notification_broadcast_segments',
  properties: {
    id: { type: 'uuid', primary: true },
    broadcastId: { type: 'uuid', fieldName: 'broadcast_id' },
    segmentId: { type: 'uuid', fieldName: 'segment_id' },
  },
  uniques: [
    { name: 'uq__notification_broadcast_segments__broadcast__segment', properties: ['broadcastId', 'segmentId'] },
  ],
});

export class NotificationAudienceSnapshotEntity {
  id: string = randomUUID();
  broadcastId!: string;
  snapshotAt: Date = new Date();
  status: NotificationAudienceSnapshotStatus = NotificationAudienceSnapshotStatus.Created;
  resolvedCount = 0;
  distinctCount = 0;
  duplicateCount = 0;
  conflictCount = 0;
  invalidCount = 0;
  error: NotificationError | null = null;
  claimedAt: Date = new Date(0);
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: Partial<NotificationAudienceSnapshotEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationAudienceSnapshotEntitySchema = new EntitySchema<NotificationAudienceSnapshotEntity>({
  class: NotificationAudienceSnapshotEntity,
  tableName: 'notification_audience_snapshots',
  properties: {
    id: { type: 'uuid', primary: true },
    broadcastId: { type: 'uuid', fieldName: 'broadcast_id' },
    snapshotAt: { type: 'timestamptz', fieldName: 'snapshot_at' },
    status: { type: 'varchar', length: 16, default: NotificationAudienceSnapshotStatus.Created },
    resolvedCount: { type: 'integer', fieldName: 'resolved_count', default: 0 },
    distinctCount: { type: 'integer', fieldName: 'distinct_count', default: 0 },
    duplicateCount: { type: 'integer', fieldName: 'duplicate_count', default: 0 },
    conflictCount: { type: 'integer', fieldName: 'conflict_count', default: 0 },
    invalidCount: { type: 'integer', fieldName: 'invalid_count', default: 0 },
    error: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    claimedAt: { type: 'timestamptz', fieldName: 'claimed_at', defaultRaw: "'1970-01-01 00:00:00+00'" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [{ name: 'ix__notification_audience_snapshots__status_created_at', properties: ['status', 'createdAt'] }],
});

export class NotificationAudienceSnapshotMemberEntity {
  id: string = randomUUID();
  snapshotId!: string;
  targetType: NotificationTargetType = NotificationTargetType.User;
  targetId!: string;
  language: string | null = null;
  variables: NotificationData = {};
  materializedAt: Date | null = null;
  createdAt: Date = new Date();

  constructor(input?: Partial<NotificationAudienceSnapshotMemberEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationAudienceSnapshotMemberEntitySchema =
  new EntitySchema<NotificationAudienceSnapshotMemberEntity>({
    class: NotificationAudienceSnapshotMemberEntity,
    tableName: 'notification_audience_snapshot_members',
    properties: {
      id: { type: 'uuid', primary: true },
      snapshotId: { type: 'uuid', fieldName: 'snapshot_id' },
      targetType: { type: 'varchar', fieldName: 'target_type', length: 32, default: NotificationTargetType.User },
      targetId: { type: 'varchar', fieldName: 'target_id', length: 320 },
      language: { type: 'varchar', length: 16, nullable: true, default: null },
      variables: { type: 'json', defaultRaw: "'{}'::jsonb" },
      materializedAt: { type: 'timestamptz', fieldName: 'materialized_at', nullable: true, default: null },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    },
    uniques: [
      {
        name: 'uq__notification_audience_snapshot_members__snapshot__target',
        properties: ['snapshotId', 'targetType', 'targetId'],
      },
    ],
    indexes: [
      {
        name: 'ix__notification_audience_snapshot_members__snapshot_id_materialized_at_id',
        properties: ['snapshotId', 'materializedAt', 'id'],
      },
    ],
  });

export class NotificationBroadcastCommandEntity {
  id: string = randomUUID();
  broadcastId!: string;
  action!: string;
  idempotencyKey!: string;
  actorId!: string;
  createdAt: Date = new Date();

  constructor(input?: Partial<NotificationBroadcastCommandEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationBroadcastCommandEntitySchema = new EntitySchema<NotificationBroadcastCommandEntity>({
  class: NotificationBroadcastCommandEntity,
  tableName: 'notification_broadcast_commands',
  properties: {
    id: { type: 'uuid', primary: true },
    broadcastId: { type: 'uuid', fieldName: 'broadcast_id' },
    action: { type: 'varchar', length: 32 },
    idempotencyKey: { type: 'varchar', fieldName: 'idempotency_key', length: 160 },
    actorId: { type: 'varchar', fieldName: 'actor_id', length: 160 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
  uniques: [
    {
      name: 'uq__notification_broadcast_commands__broadcast__action__key',
      properties: ['broadcastId', 'action', 'idempotencyKey'],
    },
  ],
});
