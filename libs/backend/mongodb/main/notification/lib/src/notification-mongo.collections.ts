/* eslint-disable no-await-in-loop -- schema and index initialization is intentionally ordered */
import type { Db, Document, IndexDescription } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from '../../../shared/lib/src/migrations/mongo-migration';
import { NotificationMongoCollections } from './notification-mongo.documents';

const text = { bsonType: 'string' } as const;
const nullableText = { bsonType: ['string', 'null'] } as const;
const date = { bsonType: 'date' } as const;
const nullableDate = { bsonType: ['date', 'null'] } as const;
const object = { bsonType: 'object' } as const;
const nullableObject = { bsonType: ['object', 'null'] } as const;
const nullableJson = { bsonType: ['object', 'array', 'string', 'bool', 'int', 'long', 'double', 'null'] } as const;
const integer = { bsonType: ['int', 'long'], minimum: 0 } as const;
const targetType = { enum: ['user', 'email', 'push-token', 'telegram-chat', 'system-telegram-chat'] } as const;
const channel = { enum: ['bot', 'email', 'push', 'in_app'] } as const;
const deliveryChannel = { enum: ['bot', 'email', 'push'] } as const;
const provider = { enum: ['telegram-bot', 'discord-bot', 'resend', 'mailpace', 'google-fcm', 'apple-apns'] } as const;
const notificationStatus = { enum: ['pending', 'paused', 'sent', 'error', 'rejected', 'cancelled'] } as const;

function validator(required: string[], properties: Record<string, unknown>): Document {
  return {
    $jsonSchema: {
      bsonType: 'object',
      additionalProperties: false,
      required: ['_id', ...required],
      properties: { _id: text, ...properties },
    },
  };
}

export const NotificationMongoCollectionDefinitions: Array<{
  name: string;
  validator: Document;
  indexes: IndexDescription[];
}> = [
  {
    name: NotificationMongoCollections.templates,
    validator: validator(
      [
        'tenantId',
        'code',
        'name',
        'description',
        'source',
        'status',
        'currentVersionId',
        'createdBy',
        'updatedBy',
        'createdAt',
        'updatedAt',
      ],
      {
        tenantId: nullableText,
        code: text,
        name: text,
        description: nullableText,
        source: { enum: ['code', 'admin'] },
        status: { enum: ['draft', 'published', 'archived'] },
        currentVersionId: nullableText,
        createdBy: nullableText,
        updatedBy: nullableText,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'uq__notification_templates__code', key: { code: 1 }, unique: true },
      { name: 'ix__notification_templates__tenant_updated', key: { tenantId: 1, updatedAt: -1 } },
    ],
  },
  {
    name: NotificationMongoCollections.templateVersions,
    validator: validator(
      ['templateId', 'version', 'variablesSchema', 'publishedAt', 'publishedBy', 'createdAt', 'updatedAt'],
      {
        templateId: text,
        version: { bsonType: ['int', 'long'], minimum: 1 },
        variablesSchema: object,
        publishedAt: nullableDate,
        publishedBy: nullableText,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__notification_template_versions__template_version',
        key: { templateId: 1, version: 1 },
        unique: true,
      },
    ],
  },
  {
    name: NotificationMongoCollections.templateVersionChannels,
    validator: validator(['templateVersionId', 'channel', 'engine', 'content', 'createdAt'], {
      templateVersionId: text,
      channel,
      engine: { enum: ['string-format', 'eta'] },
      content: object,
      createdAt: date,
    }),
    indexes: [
      {
        name: 'uq__notification_template_channels__version_channel',
        key: { templateVersionId: 1, channel: 1 },
        unique: true,
      },
    ],
  },
  {
    name: NotificationMongoCollections.notifications,
    validator: validator(
      [
        'targetType',
        'targetId',
        'templateId',
        'templateVersionId',
        'data',
        'sensitiveData',
        'extra',
        'inAppVisible',
        'broadcastId',
        'createdAt',
      ],
      {
        targetType,
        targetId: text,
        templateId: text,
        templateVersionId: text,
        data: nullableJson,
        sensitiveData: nullableObject,
        extra: nullableObject,
        inAppVisible: { bsonType: 'bool' },
        broadcastId: nullableText,
        createdAt: date,
      },
    ),
    indexes: [
      { name: 'ix__notifications__target_created', key: { targetType: 1, targetId: 1, createdAt: -1 } },
      {
        name: 'uq__notifications__broadcast_target',
        key: { broadcastId: 1, targetType: 1, targetId: 1 },
        unique: true,
        partialFilterExpression: { broadcastId: { $type: 'string' } },
      },
    ],
  },
  {
    name: NotificationMongoCollections.deliveries,
    validator: validator(
      [
        'notificationId',
        'targetType',
        'targetId',
        'channel',
        'status',
        'error',
        'attempts',
        'provider',
        'broadcastId',
        'priority',
        'sendAfter',
        'sentAt',
        'claimToken',
        'claimExpiresAt',
        'createdAt',
        'updatedAt',
      ],
      {
        notificationId: text,
        targetType,
        targetId: text,
        channel: deliveryChannel,
        status: notificationStatus,
        error: nullableObject,
        attempts: integer,
        provider,
        broadcastId: nullableText,
        priority: { bsonType: ['int', 'long'] },
        sendAfter: date,
        sentAt: nullableDate,
        claimToken: nullableText,
        claimExpiresAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__notification_deliveries__notification_channel',
        key: { notificationId: 1, channel: 1 },
        unique: true,
      },
      {
        name: 'ix__notification_deliveries__claim',
        key: { targetType: 1, status: 1, sendAfter: 1, claimExpiresAt: 1, priority: -1, _id: 1 },
      },
      { name: 'ix__notification_deliveries__recent_errors', key: { status: 1, targetType: 1, updatedAt: -1 } },
      { name: 'ix__notification_deliveries__broadcast_status', key: { broadcastId: 1, status: 1 } },
    ],
  },
  {
    name: NotificationMongoCollections.segments,
    validator: validator(
      [
        'tenantId',
        'name',
        'kind',
        'resolverKey',
        'parameters',
        'status',
        'memberCount',
        'createdBy',
        'updatedBy',
        'createdAt',
        'updatedAt',
      ],
      {
        tenantId: text,
        name: text,
        kind: { enum: ['static', 'dynamic'] },
        resolverKey: nullableText,
        parameters: object,
        status: { enum: ['active', 'archived'] },
        memberCount: integer,
        createdBy: text,
        updatedBy: text,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__notification_segments__tenant_name_active',
        key: { tenantId: 1, name: 1 },
        unique: true,
        partialFilterExpression: { status: 'active' },
        collation: { locale: 'en', strength: 2 },
      },
      { name: 'ix__notification_segments__tenant_status_updated', key: { tenantId: 1, status: 1, updatedAt: -1 } },
    ],
  },
  {
    name: NotificationMongoCollections.segmentMembers,
    validator: validator(['segmentId', 'targetType', 'targetId', 'language', 'variables', 'createdAt'], {
      segmentId: text,
      targetType,
      targetId: text,
      language: nullableText,
      variables: object,
      createdAt: date,
    }),
    indexes: [
      {
        name: 'uq__notification_segment_members__segment_target',
        key: { segmentId: 1, targetType: 1, targetId: 1 },
        unique: true,
      },
    ],
  },
  {
    name: NotificationMongoCollections.segmentUploads,
    validator: validator(
      [
        'segmentId',
        'objectKey',
        'checksum',
        'status',
        'totalRows',
        'validRows',
        'duplicateRows',
        'invalidRows',
        'errors',
        'claimToken',
        'claimExpiresAt',
        'createdBy',
        'createdAt',
        'updatedAt',
      ],
      {
        segmentId: text,
        objectKey: text,
        checksum: text,
        status: { enum: ['pending', 'processing', 'completed', 'failed'] },
        totalRows: integer,
        validRows: integer,
        duplicateRows: integer,
        invalidRows: integer,
        errors: { bsonType: 'array', items: text },
        claimToken: nullableText,
        claimExpiresAt: nullableDate,
        createdBy: text,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'uq__notification_segment_uploads__segment_checksum', key: { segmentId: 1, checksum: 1 }, unique: true },
      { name: 'ix__notification_segment_uploads__claim', key: { status: 1, claimExpiresAt: 1, createdAt: 1, _id: 1 } },
    ],
  },
  {
    name: NotificationMongoCollections.broadcasts,
    validator: validator(
      [
        'tenantId',
        'name',
        'templateVersionId',
        'channel',
        'provider',
        'priority',
        'status',
        'scheduledAt',
        'globalVariables',
        'snapshotCount',
        'queuedCount',
        'sentCount',
        'rejectedCount',
        'errorCount',
        'pendingCount',
        'cancelledCount',
        'materializedAt',
        'materializationClaimToken',
        'materializationClaimExpiresAt',
        'createdBy',
        'approvedBy',
        'createdAt',
        'updatedAt',
      ],
      {
        tenantId: text,
        name: text,
        templateVersionId: text,
        channel: deliveryChannel,
        provider,
        priority: { bsonType: ['int', 'long'], minimum: 0, maximum: 10 },
        status: {
          enum: ['draft', 'collecting', 'ready', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed'],
        },
        scheduledAt: nullableDate,
        globalVariables: object,
        snapshotCount: integer,
        queuedCount: integer,
        sentCount: integer,
        rejectedCount: integer,
        errorCount: integer,
        pendingCount: integer,
        cancelledCount: integer,
        materializedAt: nullableDate,
        materializationClaimToken: nullableText,
        materializationClaimExpiresAt: nullableDate,
        createdBy: text,
        approvedBy: nullableText,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'ix__notification_broadcasts__tenant_status_created', key: { tenantId: 1, status: 1, createdAt: -1 } },
      { name: 'ix__notification_broadcasts__due', key: { status: 1, scheduledAt: 1 } },
      {
        name: 'ix__notification_broadcasts__materialization_claim',
        key: { status: 1, materializedAt: 1, materializationClaimExpiresAt: 1, updatedAt: 1, _id: 1 },
      },
    ],
  },
  {
    name: NotificationMongoCollections.broadcastSegments,
    validator: validator(['broadcastId', 'segmentId'], { broadcastId: text, segmentId: text }),
    indexes: [
      {
        name: 'uq__notification_broadcast_segments__broadcast_segment',
        key: { broadcastId: 1, segmentId: 1 },
        unique: true,
      },
    ],
  },
  {
    name: NotificationMongoCollections.snapshots,
    validator: validator(
      [
        'broadcastId',
        'snapshotAt',
        'status',
        'resolvedCount',
        'distinctCount',
        'duplicateCount',
        'conflictCount',
        'invalidCount',
        'error',
        'claimToken',
        'claimExpiresAt',
        'createdAt',
        'updatedAt',
      ],
      {
        broadcastId: text,
        snapshotAt: date,
        status: { enum: ['created', 'collecting', 'completed', 'failed'] },
        resolvedCount: integer,
        distinctCount: integer,
        duplicateCount: integer,
        conflictCount: integer,
        invalidCount: integer,
        error: nullableObject,
        claimToken: nullableText,
        claimExpiresAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    ),
    indexes: [
      { name: 'ix__notification_snapshots__claim', key: { status: 1, claimExpiresAt: 1, createdAt: 1, _id: 1 } },
      { name: 'ix__notification_snapshots__broadcast_created', key: { broadcastId: 1, createdAt: -1 } },
    ],
  },
  {
    name: NotificationMongoCollections.snapshotMembers,
    validator: validator(
      ['snapshotId', 'targetType', 'targetId', 'language', 'variables', 'materializedAt', 'createdAt'],
      {
        snapshotId: text,
        targetType,
        targetId: text,
        language: nullableText,
        variables: object,
        materializedAt: nullableDate,
        createdAt: date,
      },
    ),
    indexes: [
      {
        name: 'uq__notification_snapshot_members__snapshot_target',
        key: { snapshotId: 1, targetType: 1, targetId: 1 },
        unique: true,
      },
      { name: 'ix__notification_snapshot_members__materialization', key: { snapshotId: 1, materializedAt: 1, _id: 1 } },
    ],
  },
  {
    name: NotificationMongoCollections.broadcastCommands,
    validator: validator(['broadcastId', 'action', 'idempotencyKey', 'actorId', 'createdAt'], {
      broadcastId: text,
      action: text,
      idempotencyKey: text,
      actorId: text,
      createdAt: date,
    }),
    indexes: [
      {
        name: 'uq__notification_broadcast_commands__broadcast_action_key',
        key: { broadcastId: 1, action: 1, idempotencyKey: 1 },
        unique: true,
      },
    ],
  },
];

export async function initializeMongoNotificationPersistence(database: Db): Promise<void> {
  for (const definition of NotificationMongoCollectionDefinitions) {
    try {
      await database.createCollection(definition.name, {
        validator: definition.validator,
        validationAction: 'error',
        validationLevel: 'strict',
      });
    } catch (error) {
      if (!isNamespaceExistsError(error)) {
        throw error;
      }
      await database.command({
        collMod: definition.name,
        validator: definition.validator,
        validationAction: 'error',
        validationLevel: 'strict',
      });
    }
    await database.collection(definition.name).createIndexes(definition.indexes);
  }
}

export async function verifyMongoNotificationPersistence(database: Db): Promise<void> {
  for (const definition of NotificationMongoCollectionDefinitions) {
    await assertCollectionDefinition(database, definition);
  }
}

function isNamespaceExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 48;
}
