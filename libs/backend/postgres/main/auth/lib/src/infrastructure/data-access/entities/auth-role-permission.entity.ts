import { EntitySchema } from '@mikro-orm/core';

export interface AuthRolePermissionEntityInput {
  roleId: string;
  permissionId: string;
}

export class AuthRolePermissionEntity {
  roleId!: string;
  permissionId!: string;
  createdAt: Date = new Date();

  constructor(input?: AuthRolePermissionEntityInput) {
    if (input) {
      this.roleId = input.roleId;
      this.permissionId = input.permissionId;
    }
  }
}

export const AuthRolePermissionEntitySchema = new EntitySchema<AuthRolePermissionEntity>({
  class: AuthRolePermissionEntity,
  tableName: 'auth_role_permissions',
  properties: {
    roleId: { type: 'uuid', fieldName: 'role_id', primary: true },
    permissionId: {
      type: 'uuid',
      fieldName: 'permission_id',
      primary: true,
    },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
  indexes: [
    {
      name: 'ix__auth_role_permissions__permission_id',
      properties: ['permissionId'],
    },
  ],
});
