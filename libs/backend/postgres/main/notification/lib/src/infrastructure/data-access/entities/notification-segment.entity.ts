import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  type NotificationData,
  NotificationSegmentKind,
  NotificationSegmentStatus,
  NotificationSegmentUploadStatus,
  NotificationTargetType,
} from '@app/common-notifications';

export class NotificationSegmentEntity {
  id: string = randomUUID();
  tenantId!: string;
  name!: string;
  kind: NotificationSegmentKind = NotificationSegmentKind.Static;
  resolverKey: string | null = null;
  parameters: NotificationData = {};
  status: NotificationSegmentStatus = NotificationSegmentStatus.Active;
  memberCount = 0;
  createdBy!: string;
  updatedBy!: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: Partial<NotificationSegmentEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationSegmentEntitySchema = new EntitySchema<NotificationSegmentEntity>({
  class: NotificationSegmentEntity,
  tableName: 'notification_segments',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id' },
    name: { type: 'varchar', length: 160 },
    kind: { type: 'varchar', length: 16, default: NotificationSegmentKind.Static },
    resolverKey: { type: 'varchar', fieldName: 'resolver_key', length: 128, nullable: true, default: null },
    parameters: { type: 'json', defaultRaw: "'{}'::jsonb" },
    status: { type: 'varchar', length: 16, default: NotificationSegmentStatus.Active },
    memberCount: { type: 'integer', fieldName: 'member_count', default: 0 },
    createdBy: { type: 'varchar', fieldName: 'created_by', length: 160 },
    updatedBy: { type: 'varchar', fieldName: 'updated_by', length: 160 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [{ name: 'ix__notification_segments__tenant_id_status', properties: ['tenantId', 'status'] }],
});

export class NotificationSegmentMemberEntity {
  id: string = randomUUID();
  segmentId!: string;
  targetType: NotificationTargetType = NotificationTargetType.User;
  targetId!: string;
  language: string | null = null;
  variables: NotificationData = {};
  createdAt: Date = new Date();

  constructor(input?: Partial<NotificationSegmentMemberEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationSegmentMemberEntitySchema = new EntitySchema<NotificationSegmentMemberEntity>({
  class: NotificationSegmentMemberEntity,
  tableName: 'notification_segment_members',
  properties: {
    id: { type: 'uuid', primary: true },
    segmentId: { type: 'uuid', fieldName: 'segment_id' },
    targetType: { type: 'varchar', fieldName: 'target_type', length: 32, default: NotificationTargetType.User },
    targetId: { type: 'varchar', fieldName: 'target_id', length: 320 },
    language: { type: 'varchar', length: 16, nullable: true, default: null },
    variables: { type: 'json', defaultRaw: "'{}'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
  uniques: [
    { name: 'uq__notification_segment_members__segment__target', properties: ['segmentId', 'targetType', 'targetId'] },
  ],
  indexes: [{ name: 'ix__notification_segment_members__segment_id_id', properties: ['segmentId', 'id'] }],
});

export class NotificationSegmentUploadEntity {
  id: string = randomUUID();
  segmentId!: string;
  objectKey!: string;
  checksum!: string;
  status: NotificationSegmentUploadStatus = NotificationSegmentUploadStatus.Pending;
  totalRows = 0;
  validRows = 0;
  duplicateRows = 0;
  invalidRows = 0;
  errors: string[] = [];
  claimedAt: Date = new Date(0);
  createdBy!: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: Partial<NotificationSegmentUploadEntity>) {
    Object.assign(this, input);
  }
}

export const NotificationSegmentUploadEntitySchema = new EntitySchema<NotificationSegmentUploadEntity>({
  class: NotificationSegmentUploadEntity,
  tableName: 'notification_segment_uploads',
  properties: {
    id: { type: 'uuid', primary: true },
    segmentId: { type: 'uuid', fieldName: 'segment_id' },
    objectKey: { type: 'varchar', fieldName: 'object_key', length: 512 },
    checksum: { type: 'varchar', length: 64 },
    status: { type: 'varchar', length: 16, default: NotificationSegmentUploadStatus.Pending },
    totalRows: { type: 'integer', fieldName: 'total_rows', default: 0 },
    validRows: { type: 'integer', fieldName: 'valid_rows', default: 0 },
    duplicateRows: { type: 'integer', fieldName: 'duplicate_rows', default: 0 },
    invalidRows: { type: 'integer', fieldName: 'invalid_rows', default: 0 },
    errors: { type: 'json', defaultRaw: "'[]'::jsonb" },
    claimedAt: { type: 'timestamptz', fieldName: 'claimed_at', defaultRaw: "'1970-01-01 00:00:00+00'" },
    createdBy: { type: 'varchar', fieldName: 'created_by', length: 160 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'uq__notification_segment_uploads__segment__checksum', properties: ['segmentId', 'checksum'] }],
  indexes: [{ name: 'ix__notification_segment_uploads__status_created_at', properties: ['status', 'createdAt'] }],
});
