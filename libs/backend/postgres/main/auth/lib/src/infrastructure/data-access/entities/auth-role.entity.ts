import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from './auth-user.entity';

export interface AuthRoleEntityInput {
  tenantId?: string;
  key: string;
  label?: string;
  description?: string;
  isSystem?: boolean;
}

export class AuthRoleEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  key!: string;
  label = '';
  description = '';
  isSystem = false;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: AuthRoleEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.key = input.key;
      this.label = input.label ?? '';
      this.description = input.description ?? '';
      this.isSystem = input.isSystem ?? false;
    }
  }
}

export const AuthRoleEntitySchema = new EntitySchema<AuthRoleEntity>({
  class: AuthRoleEntity,
  tableName: 'auth_roles',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    key: { type: 'varchar', length: 64 },
    label: { type: 'varchar', length: 160, default: '' },
    description: { type: 'varchar', length: 512, default: '' },
    isSystem: { type: 'boolean', fieldName: 'is_system', default: false },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  uniques: [
    {
      name: 'uq__auth_roles__tenant_id_key',
      properties: ['tenantId', 'key'],
    },
  ],
});
