import type {
  NotificationAudienceSnapshotStatus,
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationData,
  NotificationDeliveryChannel,
  NotificationDeliveryProvider,
  NotificationError,
  NotificationExtra,
  NotificationSegmentKind,
  NotificationSegmentStatus,
  NotificationSegmentUploadStatus,
  NotificationSensitiveData,
  NotificationStatus,
  NotificationTargetType,
  NotificationTemplateChannelContent,
  NotificationTemplateEngine,
  NotificationTemplateSource,
  NotificationTemplateStatus,
  NotificationVariablesSchema,
} from '@app/common-notifications';

export const NotificationMongoCollections = {
  templates: 'notification_templates',
  templateVersions: 'notification_template_versions',
  templateVersionChannels: 'notification_template_version_channels',
  notifications: 'notifications',
  deliveries: 'notification_deliveries',
  segments: 'notification_segments',
  segmentMembers: 'notification_segment_members',
  segmentUploads: 'notification_segment_uploads',
  broadcasts: 'notification_broadcasts',
  broadcastSegments: 'notification_broadcast_segments',
  snapshots: 'notification_audience_snapshots',
  snapshotMembers: 'notification_audience_snapshot_members',
  broadcastCommands: 'notification_broadcast_commands',
} as const;

export interface EncryptedNotificationPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export interface NotificationTemplateDocument {
  _id: string;
  tenantId: string | null;
  code: string;
  name: string;
  description: string | null;
  source: NotificationTemplateSource;
  status: NotificationTemplateStatus;
  currentVersionId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTemplateVersionDocument {
  _id: string;
  templateId: string;
  version: number;
  variablesSchema: NotificationVariablesSchema;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationTemplateVersionChannelDocument {
  _id: string;
  templateVersionId: string;
  channel: NotificationChannel;
  engine: NotificationTemplateEngine;
  content: NotificationTemplateChannelContent;
  createdAt: Date;
}

export interface NotificationDocument<T = NotificationData> {
  _id: string;
  targetType: NotificationTargetType;
  targetId: string;
  templateId: string;
  templateVersionId: string;
  data: T | null;
  sensitiveData: EncryptedNotificationPayload | null;
  extra: NotificationExtra | null;
  inAppVisible: boolean;
  broadcastId: string | null;
  createdAt: Date;
}

export interface NotificationDeliveryDocument {
  _id: string;
  notificationId: string;
  targetType: NotificationTargetType;
  targetId: string;
  channel: NotificationDeliveryChannel;
  status: NotificationStatus;
  error: NotificationError | null;
  attempts: number;
  provider: NotificationDeliveryProvider;
  broadcastId: string | null;
  priority: number;
  sendAfter: Date;
  sentAt: Date | null;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationSegmentDocument {
  _id: string;
  tenantId: string;
  name: string;
  kind: NotificationSegmentKind;
  resolverKey: string | null;
  parameters: NotificationData;
  status: NotificationSegmentStatus;
  memberCount: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationSegmentMemberDocument {
  _id: string;
  segmentId: string;
  targetType: NotificationTargetType;
  targetId: string;
  language: string | null;
  variables: NotificationData;
  createdAt: Date;
}

export interface NotificationSegmentUploadDocument {
  _id: string;
  segmentId: string;
  objectKey: string;
  checksum: string;
  status: NotificationSegmentUploadStatus;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  errors: string[];
  claimToken: string | null;
  claimExpiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationBroadcastDocument {
  _id: string;
  tenantId: string;
  name: string;
  templateVersionId: string;
  channel: NotificationDeliveryChannel;
  provider: NotificationDeliveryProvider;
  priority: number;
  status: NotificationBroadcastStatus;
  scheduledAt: Date | null;
  globalVariables: NotificationData;
  snapshotCount: number;
  queuedCount: number;
  sentCount: number;
  rejectedCount: number;
  errorCount: number;
  pendingCount: number;
  cancelledCount: number;
  materializedAt: Date | null;
  materializationClaimToken: string | null;
  materializationClaimExpiresAt: Date | null;
  createdBy: string;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationBroadcastSegmentDocument {
  _id: string;
  broadcastId: string;
  segmentId: string;
}

export interface NotificationAudienceSnapshotDocument {
  _id: string;
  broadcastId: string;
  snapshotAt: Date;
  status: NotificationAudienceSnapshotStatus;
  resolvedCount: number;
  distinctCount: number;
  duplicateCount: number;
  conflictCount: number;
  invalidCount: number;
  error: NotificationError | null;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationAudienceSnapshotMemberDocument {
  _id: string;
  snapshotId: string;
  targetType: NotificationTargetType;
  targetId: string;
  language: string | null;
  variables: NotificationData;
  materializedAt: Date | null;
  createdAt: Date;
}

export interface NotificationBroadcastCommandDocument {
  _id: string;
  broadcastId: string;
  action: string;
  idempotencyKey: string;
  actorId: string;
  createdAt: Date;
}

export function isEncryptedNotificationPayload(value: unknown): value is EncryptedNotificationPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EncryptedNotificationPayload).ciphertext === 'string' &&
    typeof (value as EncryptedNotificationPayload).iv === 'string' &&
    typeof (value as EncryptedNotificationPayload).authTag === 'string' &&
    typeof (value as EncryptedNotificationPayload).keyId === 'string'
  );
}

export type MongoNotificationSensitiveData = NotificationSensitiveData;
