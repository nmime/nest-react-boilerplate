import { EntitySchema } from '@mikro-orm/core';
import {
  type NotificationError,
  NotificationPriority,
  NotificationStatus,
  NotificationChannel,
} from '../../../domain';

export enum NotificationDeliveryProvider {
  Telegram = 'telegram',
}

export interface NotificationDeliveryEntityInput {
  notificationId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  error?: NotificationError | null;
  attempts?: number;
  provider?: NotificationDeliveryProvider | null;
  priority?: number;
  sendTimeFrom?: string | null;
  sendTimeTo?: string | null;
  sentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationDeliveryEntity {
  id!: number;
  notificationId!: string;
  channel!: NotificationChannel;
  status!: NotificationStatus;
  error: NotificationError | null = null;
  attempts: number = 0;
  provider: NotificationDeliveryProvider | null = null;
  priority: number = NotificationPriority.Default;
  sendTimeFrom: string | null = null;
  sendTimeTo: string | null = null;
  sentAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationDeliveryEntityInput) {
    if (input) {
      this.notificationId = input.notificationId;
      this.channel = input.channel;
      this.status = input.status;
      this.error = input.error ?? null;
      this.attempts = input.attempts ?? 0;
      this.provider = input.provider ?? null;
      this.priority = input.priority ?? NotificationPriority.Default;
      this.sendTimeFrom = input.sendTimeFrom ?? null;
      this.sendTimeTo = input.sendTimeTo ?? null;
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
    id: { type: 'integer', primary: true, autoincrement: true },
    notificationId: { type: 'uuid', fieldName: 'notification_id' },
    channel: { type: 'varchar', length: 32 },
    status: { type: 'varchar', length: 32 },
    error: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    attempts: { type: 'integer', default: 0 },
    provider: { type: 'varchar', length: 32, nullable: true, default: null },
    priority: { type: 'int', default: NotificationPriority.Default },
    sendTimeFrom: { type: 'time', fieldName: 'send_time_from', nullable: true, default: null },
    sendTimeTo: { type: 'time', fieldName: 'send_time_to', nullable: true, default: null },
    sentAt: { type: 'timestamptz', fieldName: 'sent_at', nullable: true, default: null },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'uq__notification_deliveries__notification_id__channel', properties: ['notificationId', 'channel', 'createdAt'] }],
  indexes: [{ name: 'ix__notification_deliveries__status__send_time', properties: ['status', 'sendTimeFrom', 'sendTimeTo'] }],
});
