import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  AuthPermissionEntity,
  AuthPermissionEntitySchema,
  AuthRoleEntity,
  AuthRoleEntitySchema,
  AuthRolePermissionEntity,
  AuthRolePermissionEntitySchema,
  AuthUserRoleEntity,
  AuthUserRoleEntitySchema,
} from './index';

const DefaultAuthTenantId = '00000000-0000-0000-0000-000000000000';

describe('RBAC model entities', () => {
  it('defaults role fields and honours provided input', () => {
    expect(new AuthRoleEntity()).toMatchObject({
      tenantId: DefaultAuthTenantId,
      label: '',
      description: '',
      isSystem: false,
    });
    expect(
      new AuthRoleEntity({
        key: 'admin',
        label: 'Admin',
        description: 'System administrators',
        isSystem: true,
      }),
    ).toMatchObject({
      key: 'admin',
      label: 'Admin',
      description: 'System administrators',
      isSystem: true,
    });
  });

  it('defaults permission description and honours provided input', () => {
    const permission = new AuthPermissionEntity({
      key: 'profile:read',
      resource: 'profile',
      action: 'read',
    });

    expect(permission).toMatchObject({
      key: 'profile:read',
      resource: 'profile',
      action: 'read',
      description: '',
    });
  });

  it('captures role/permission and user/role join input', () => {
    expect(
      new AuthRolePermissionEntity({
        roleId: '11111111-1111-1111-1111-111111111111',
        permissionId: '22222222-2222-2222-2222-222222222222',
      }),
    ).toMatchObject({
      roleId: '11111111-1111-1111-1111-111111111111',
      permissionId: '22222222-2222-2222-2222-222222222222',
    });

    expect(new AuthUserRoleEntity()).toMatchObject({
      tenantId: DefaultAuthTenantId,
      grantedByUserId: null,
    });
    expect(
      new AuthUserRoleEntity({
        userId: '33333333-3333-3333-3333-333333333333',
        roleId: '44444444-4444-4444-4444-444444444444',
        grantedByUserId: '55555555-5555-5555-5555-555555555555',
      }),
    ).toMatchObject({
      userId: '33333333-3333-3333-3333-333333333333',
      roleId: '44444444-4444-4444-4444-444444444444',
      grantedByUserId: '55555555-5555-5555-5555-555555555555',
    });
  });

  it('registers auth_roles uniqueness and column mappings', () => {
    AuthRoleEntitySchema.init();
    const metadata = AuthRoleEntitySchema.meta;

    expect(metadata.tableName).toBe('auth_roles');
    expect(metadata.properties.tenantId.fieldNames).toContain('tenant_id');
    expect(metadata.properties.isSystem.fieldNames).toContain('is_system');
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: 'uq__auth_roles__tenant_id_key',
        properties: ['tenantId', 'key'],
      }),
    );
  });

  it('registers auth_permissions uniqueness and lookup index', () => {
    AuthPermissionEntitySchema.init();
    const metadata = AuthPermissionEntitySchema.meta;

    expect(metadata.tableName).toBe('auth_permissions');
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: 'uq__auth_permissions__key',
        properties: ['key'],
      }),
    );
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: 'ix__auth_permissions__resource_action',
        properties: ['resource', 'action'],
      }),
    );
  });

  it('registers composite primary keys and foreign-key column mappings', () => {
    AuthRolePermissionEntitySchema.init();
    AuthUserRoleEntitySchema.init();

    const rolePermission = AuthRolePermissionEntitySchema.meta;
    expect(rolePermission.tableName).toBe('auth_role_permissions');
    expect(rolePermission.primaryKeys).toContain('roleId');
    expect(rolePermission.primaryKeys).toContain('permissionId');
    expect(rolePermission.properties.roleId.fieldNames).toContain('role_id');
    expect(rolePermission.indexes).toContainEqual(
      expect.objectContaining({
        name: 'ix__auth_role_permissions__permission_id',
        properties: ['permissionId'],
      }),
    );

    const userRole = AuthUserRoleEntitySchema.meta;
    expect(userRole.tableName).toBe('auth_user_roles');
    expect(userRole.primaryKeys).toContain('userId');
    expect(userRole.primaryKeys).toContain('roleId');
    expect(userRole.properties.userId.fieldNames).toContain('auth_user_id');
    expect(userRole.properties.grantedByUserId.fieldNames).toContain('granted_by_user_id');
    expect(userRole.properties.grantedByUserId.nullable).toBe(true);
  });
});
