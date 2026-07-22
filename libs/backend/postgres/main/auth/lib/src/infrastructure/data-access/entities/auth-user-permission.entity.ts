import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from './auth-user.entity';

/**
 * A direct, tenant-scoped permission grant for a user. Role permissions and
 * these rows are unioned when resolving effective access; the JSON arrays on
 * `auth_users` remain a denormalized session cache only.
 */
export interface AuthUserPermissionEntityInput {
  userId: string;
  permissionId: string;
  tenantId?: string;
  grantedByUserId?: string | null;
}

export class AuthUserPermissionEntity {
  userId!: string;
  permissionId!: string;
  tenantId: string = DefaultAuthTenantId;
  grantedByUserId: string | null = null;
  createdAt: Date = new Date();

  constructor(input?: AuthUserPermissionEntityInput) {
    if (input) {
      this.userId = input.userId;
      this.permissionId = input.permissionId;
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.grantedByUserId = input.grantedByUserId ?? null;
    }
  }
}

export const AuthUserPermissionEntitySchema = new EntitySchema<AuthUserPermissionEntity>({
  class: AuthUserPermissionEntity,
  tableName: 'auth_user_permissions',
  properties: {
    userId: { type: 'uuid', fieldName: 'auth_user_id', primary: true },
    permissionId: { type: 'uuid', fieldName: 'permission_id', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    grantedByUserId: {
      type: 'uuid',
      fieldName: 'granted_by_user_id',
      nullable: true,
    },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    { name: 'ix__auth_user_permissions__permission_id', properties: ['permissionId'] },
    { name: 'ix__auth_user_permissions__tenant_id', properties: ['tenantId'] },
  ],
});
