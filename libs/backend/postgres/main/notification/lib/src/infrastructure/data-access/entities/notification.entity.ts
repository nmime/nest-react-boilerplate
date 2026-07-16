import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { NotificationData, NotificationExtra, NotificationTargetType } from '@app/common-notifications';
import { NotificationTemplateEntity } from './notification-template.entity';

export interface NotificationEntityInput<T = NotificationData> {
  targetType: NotificationTargetType;
  targetId: string;
  template: NotificationTemplateEntity;
  data?: T | null;
  extra?: NotificationExtra | null;
  inAppVisible?: boolean;
  createdAt?: Date;
}

export class NotificationEntity<T = NotificationData> {
  id: string = randomUUID();
  targetType!: NotificationTargetType;
  targetId!: string;
  template!: NotificationTemplateEntity;
  data: T | null = null;
  extra: NotificationExtra | null = null;
  inAppVisible = true;
  createdAt: Date = new Date();

  constructor(input?: NotificationEntityInput<T>) {
    if (input) {
      this.targetType = input.targetType;
      this.targetId = input.targetId;
      this.template = input.template;
      this.data = input.data ?? null;
      this.extra = input.extra ?? null;
      this.inAppVisible = input.inAppVisible ?? true;
      this.createdAt = input.createdAt ?? new Date();
    }
  }
}

export const NotificationEntitySchema = new EntitySchema<NotificationEntity>({
  class: NotificationEntity,
  tableName: 'notifications',
  properties: {
    id: { type: 'uuid', primary: true },
    targetType: { type: 'varchar', length: 32, fieldName: 'target_type' },
    targetId: { type: 'varchar', length: 64, fieldName: 'target_id' },
    template: {
      kind: 'm:1',
      entity: () => NotificationTemplateEntity,
      fieldName: 'template_id',
      deleteRule: 'restrict',
    },
    data: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    extra: { type: 'json', nullable: true, defaultRaw: 'NULL' },
    inAppVisible: { type: 'boolean', fieldName: 'in_app_visible', default: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
  indexes: [
    { name: 'ix__notifications__template_id', properties: ['template'] },
    { name: 'ix__notifications__created_at', properties: ['createdAt'] },
    {
      name: 'ix__notifications__target_type_target_id_in_app_visible_created_at_desc_id_desc',
      columns: [
        { name: 'targetType' },
        { name: 'targetId' },
        { name: 'inAppVisible' },
        { name: 'createdAt', sort: 'desc' },
        { name: 'id', sort: 'desc' },
      ],
    },
  ],
});
