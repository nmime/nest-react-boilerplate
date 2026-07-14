import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from './auth-user.entity';

export interface AuthUserRoleEntityInput {
  userId: string;
  roleId: string;
  tenantId?: string;
  grantedByUserId?: string | null;
}

export class AuthUserRoleEntity {
  userId!: string;
  roleId!: string;
  tenantId: string = DefaultAuthTenantId;
  grantedByUserId: string | null = null;
  createdAt: Date = new Date();

  constructor(input?: AuthUserRoleEntityInput) {
    if (input) {
      this.userId = input.userId;
      this.roleId = input.roleId;
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.grantedByUserId = input.grantedByUserId ?? null;
    }
  }
}

export const AuthUserRoleEntitySchema = new EntitySchema<AuthUserRoleEntity>({
  class: AuthUserRoleEntity,
  tableName: 'auth_user_roles',
  properties: {
    userId: { type: 'uuid', fieldName: 'auth_user_id', primary: true },
    roleId: { type: 'uuid', fieldName: 'role_id', primary: true },
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
    { name: 'ix__auth_user_roles__role_id', properties: ['roleId'] },
    { name: 'ix__auth_user_roles__tenant_id', properties: ['tenantId'] },
  ],
});
