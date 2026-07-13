import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  NotificationChannel,
  type NotificationData,
  type NotificationError,
  NotificationPriority,
  NotificationStatus,
  NotificationTargetType,
  type NotificationExtra,
} from '../../domain';

export interface NotificationEntityInput<T = NotificationData> {
  channel: NotificationChannel;
  targetType: NotificationTargetType;
  targetId: string;
  customTemplate?: string | null;
  templateId?: string | null;
  data?: T | null;
  extra?: NotificationExtra | null;
  inAppVisible?: boolean;
  status: NotificationStatus;
  error?: NotificationError | null;
  priority?: number;
  sendTimeFrom?: string | null;
  sendTimeTo?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class NotificationEntity<T = NotificationData> {
  id: string = randomUUID();
  channel!: NotificationChannel;
  targetType!: NotificationTargetType;
  targetId!: string;
  customTemplate: string | null = null;
  templateId: string | null = null;
  data: T | null = null;
  extra: NotificationExtra | null = null;
  inAppVisible: boolean = true;
  status!: NotificationStatus;
  error: NotificationError | null = null;
  priority: number = NotificationPriority.Default;
  sendTimeFrom: string | null = null;
  sendTimeTo: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: NotificationEntityInput<T>) {
    if (input) {
      this.channel = input.channel;
      this.targetType = input.targetType;
      this.targetId = input.targetId;
      this.customTemplate = input.customTemplate ?? null;
      this.templateId = input.templateId ?? null;
      this.data = input.data ?? null;
      this.extra = input.extra ?? null;
      this.inAppVisible = input.inAppVisible ?? true;
      this.status = input.status;
      this.error = input.error ?? null;
      this.priority = input.priority ?? NotificationPriority.Default;
      this.sendTimeFrom = input.sendTimeFrom ?? null;
      this.sendTimeTo = input.sendTimeTo ?? null;
      this.createdAt = input.createdAt ?? new Date();
      this.updatedAt = input.updatedAt ?? new Date();
    }
  }
}

export const NotificationEntitySchema = new EntitySchema<NotificationEntity>({
  class: NotificationEntity,
  tableName: 'notifications',
  properties: {
    id: { type: 'uuid', primary: true },
    channel: { type: 'varchar', length: 32 },
    targetType: { type: 'varchar', length: 32, fieldName: 'target_type' },
    targetId: { type: 'varchar', length: 64, fieldName: 'target_id' },
    customTemplate: { type: 'varchar', length: 64, fieldName: 'custom_template', nullable: true, default: null },
    templateId: { type: 'uuid', fieldName: 'template_id', nullable: true, default: null },
    data: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    extra: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    inAppVisible: { type: 'boolean', fieldName: 'in_app_visible', default: true },
    status: { type: 'varchar', length: 32 },
    error: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    priority: { type: 'int', default: NotificationPriority.Default },
    sendTimeFrom: { type: 'time', fieldName: 'send_time_from', nullable: true, default: null },
    sendTimeTo: { type: 'time', fieldName: 'send_time_to', nullable: true, default: null },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    { name: 'ix__notifications__status', properties: ['status'] },
    { name: 'ix__notifications__custom_template', properties: ['customTemplate'] },
    { name: 'ix__notifications__template_id', properties: ['templateId'] },
    { name: 'ix__notifications__created_at', properties: ['createdAt'] },
    { name: 'ix__notifications__status_target_type_send_time', properties: ['status', 'targetType', 'sendTimeFrom', 'sendTimeTo'] },
    { name: 'ix__notifications__feed', properties: ['targetType', 'targetId', 'inAppVisible', 'createdAt', 'id'] },
  ],
});
