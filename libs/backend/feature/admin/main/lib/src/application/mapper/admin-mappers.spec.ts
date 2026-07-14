import { describe, expect, it } from 'vitest';
import type {
  AdminAuditLogEntity,
  AuthPermissionEntity,
  AuthRoleWithPermissions,
  AuthUserEntity,
} from '@app/backend-postgres-main-auth';
import { AdminUsersReadPermission, UserProfileReadPermission } from '@app/common-authz';
import { toAdminAuditLogView, toAdminRoleView, toAdminUserView, toPermissionView } from './index';

const baseUser = (partial: Partial<AuthUserEntity> = {}): AuthUserEntity => ({
  id: 'user-id',
  tenantId: 'tenant-1',
  email: 'user@example.com',
  displayName: 'User',
  passwordHash: 'redacted',
  status: 'active',
  roles: ['user'],
  permissions: [UserProfileReadPermission],
  locale: 'en',
  theme: 'system',
  lastLoginAt: new Date('2026-01-04T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...partial,
});

describe('toAdminUserView', () => {
  it('includes displayName and a real lastLoginAt timestamp', () => {
    expect(toAdminUserView(baseUser())).toMatchObject({
      displayName: 'User',
      lastLoginAt: '2026-01-04T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('omits displayName and lastLoginAt when absent or at the epoch', () => {
    const view = toAdminUserView(baseUser({ displayName: undefined, lastLoginAt: new Date(0) }));

    expect(view).not.toHaveProperty('displayName');
    expect(view).not.toHaveProperty('lastLoginAt');
  });

  it('omits lastLoginAt when the source date is null', () => {
    const user = baseUser();
    Reflect.set(user, 'lastLoginAt', null);
    const view = toAdminUserView(user);

    expect(view).not.toHaveProperty('lastLoginAt');
  });
});

const baseAudit = (partial: Partial<AdminAuditLogEntity> = {}): AdminAuditLogEntity => ({
  id: 'audit-id',
  tenantId: 'tenant-1',
  actorUserId: 'actor-id',
  action: 'admin.user.status.update',
  resource: 'admin.users',
  targetUserId: 'user-id',
  before: { status: 'active' },
  after: { status: 'disabled' },
  metadata: { requestId: 'req-1' },
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  ...partial,
});

describe('toAdminAuditLogView', () => {
  it('includes actorUserId and targetUserId when present', () => {
    expect(toAdminAuditLogView(baseAudit())).toMatchObject({
      actorUserId: 'actor-id',
      targetUserId: 'user-id',
    });
  });

  it('omits actorUserId and targetUserId when absent', () => {
    const view = toAdminAuditLogView(baseAudit({ actorUserId: undefined, targetUserId: undefined }));

    expect(view).not.toHaveProperty('actorUserId');
    expect(view).not.toHaveProperty('targetUserId');
  });
});

describe('toAdminRoleView', () => {
  it('maps a role aggregate and orders its permission keys', () => {
    const entry: AuthRoleWithPermissions = {
      role: {
        id: 'role-admin',
        key: 'admin',
        label: 'Administrator',
        description: '',
        isSystem: true,
      },
      permissionKeys: [AdminUsersReadPermission, UserProfileReadPermission],
    };

    expect(toAdminRoleView(entry)).toEqual({
      id: 'role-admin',
      role: 'admin',
      label: 'Administrator',
      description: '',
      isSystem: true,
      permissions: [UserProfileReadPermission, AdminUsersReadPermission],
    });
  });
});

describe('toPermissionView', () => {
  it('projects the catalog fields of a permission entity', () => {
    const entity: AuthPermissionEntity = {
      key: AdminUsersReadPermission,
      resource: 'admin.users',
      action: 'read',
      description: 'Read admin users',
    };

    expect(toPermissionView(entity)).toEqual({
      permission: AdminUsersReadPermission,
      resource: 'admin.users',
      action: 'read',
      description: 'Read admin users',
    });
  });
});
