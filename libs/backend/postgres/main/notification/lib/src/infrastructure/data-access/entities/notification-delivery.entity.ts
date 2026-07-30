import { EntitySchema } from '@mikro-orm/core';
import {
  type NotificationDeliveryChannel,
  type NotificationDeliveryProvider,
  type NotificationError,
  NotificationPriority,
  NotificationStatus,
  type NotificationTargetType,
} from '@app/common-notifications';

export interface NotificationDeliveryEntityInput {
  notificationId: string;
  targetType: NotificationTargetType;
  targetId: string;
  channel: NotificationDeliveryChannel;
  status: NotificationStatus;
  error?: NotificationError | null;
  attempts?: number;
  provider: NotificationDeliveryProvider;
  broadcastId?: string | null;
  priority?: number;
  sendAfter?: Date;
  sentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const EmptyNotificationDeliveryClaimId = '00000000-0000-0000-0000-000000000000';
export const EmptyNotificationDeliveryTimestamp = new Date(0);

export class NotificationDeliveryEntity {
  id!: string;
  notificationId!: string;
  targetType!: NotificationTargetType;
  targetId!: string;
  channel!: NotificationDeliveryChannel;
  status!: NotificationStatus;
  error: NotificationError | null = null;
  attempts = 0;
  provider!: NotificationDeliveryProvider;
  broadcastId: string | null = null;
  priority: number = NotificationPriority.Default;
  sendAfter: Date = new Date();
  sentAt: Date | null = null;
  // A value after the epoch means provider dispatch began but no durable result
  // was recorded. Such an unknown outcome is quarantined from automatic re-claim.
  dispatchStartedAt: Date = new Date(EmptyNotificationDeliveryTimestamp.getTime());
  // Delivery-claim lease marker. The epoch sentinel means "unclaimed"; the scheduler
  // stamps it with the claim time and re-claims only once the lease has elapsed.
  claimedAt: Date = new Date(0);
  claimToken: string = EmptyNotificationDeliveryClaimId;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationDeliveryEntityInput) {
    if (input) {
      this.notificationId = input.notificationId;
      this.targetType = input.targetType;
      this.targetId = input.targetId;
      this.channel = input.channel;
      this.status = input.status;
      this.error = input.error ?? null;
      this.attempts = input.attempts ?? 0;
      this.provider = input.provider;
      this.broadcastId = input.broadcastId ?? null;
      this.priority = input.priority ?? NotificationPriority.Default;
      this.sendAfter = input.sendAfter ?? new Date();
      this.sentAt = input.sentAt ?? null;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

export const NotificationDeliveryEntitySchema = new EntitySchema<NotificationDeliveryEntity>({
  class: NotificationDeliveryEntity,
  tableName: 'notification_deliveries',
  properties: {
    id: { type: 'bigint', primary: true, autoincrement: true },
    notificationId: { type: 'uuid', fieldName: 'notification_id' },
    targetType: { type: 'varchar', length: 32, fieldName: 'target_type' },
    targetId: { type: 'varchar', length: 320, fieldName: 'target_id' },
    channel: { type: 'varchar', length: 32 },
    status: { type: 'varchar', length: 32 },
    error: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    attempts: { type: 'integer', default: 0 },
    provider: { type: 'varchar', length: 32 },
    broadcastId: { type: 'uuid', fieldName: 'broadcast_id', nullable: true, default: null },
    priority: { type: 'int', default: NotificationPriority.Default },
    sendAfter: { type: 'timestamptz', fieldName: 'send_after', onCreate: () => new Date() },
    sentAt: { type: 'timestamptz', fieldName: 'sent_at', nullable: true, default: null },
    dispatchStartedAt: {
      type: 'timestamptz',
      fieldName: 'dispatch_started_at',
      defaultRaw: "'1970-01-01 00:00:00+00'",
    },
    claimedAt: { type: 'timestamptz', fieldName: 'claimed_at', defaultRaw: "'1970-01-01 00:00:00+00'" },
    claimToken: {
      type: 'uuid',
      fieldName: 'claim_token',
      defaultRaw: "'00000000-0000-0000-0000-000000000000'::uuid",
    },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', primary: true, onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [
    {
      name: 'uq__notification_deliveries__notification_id__channel',
      properties: ['notificationId', 'channel', 'createdAt'],
    },
  ],
  indexes: [
    { name: 'ix__notification_deliveries__broadcast_id_status', properties: ['broadcastId', 'status'] },
    { name: 'ix__notification_deliveries__claim_token', properties: ['claimToken'] },
    {
      name: 'ix__notification_deliveries__target_type_status_send_after_target_id_priority_desc_id',
      columns: [
        { name: 'targetType' },
        { name: 'status' },
        { name: 'sendAfter' },
        { name: 'targetId' },
        { name: 'priority', sort: 'desc' },
        { name: 'id' },
      ],
    },
  ],
});
