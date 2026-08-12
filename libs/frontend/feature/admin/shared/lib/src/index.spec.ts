// @requirements REQ-FRONTEND-SHELL-004
import { describe, expect, it } from 'vitest';
import {
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminRolesWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersStatusUpdatePermission,
  createAdminAccessPolicy,
  assertCanReadAdminProfile,
  normalizeStringList,
  AdminCapabilityPermissions,
  composeAdminCapabilities,
  createAdminAccessPolicyFactory,
} from './index';

describe('@app/frontend-feature-admin-shared access policy', () => {
  it('derives a frontend-safe admin access policy from principal claims', () => {
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [
          AdminProfileReadPermission,
          AdminDashboardReadPermission,
          AdminUsersStatusUpdatePermission,
          AdminUsersAccessPolicyUpdatePermission,
        ],
      }),
    ).toEqual({
      isAuthenticated: true,
      roles: [AdminRole],
      permissions: [
        AdminProfileReadPermission,
        AdminDashboardReadPermission,
        AdminUsersStatusUpdatePermission,
        AdminUsersAccessPolicyUpdatePermission,
      ],
      canAccessAdmin: true,
      canReadProfile: true,
      canReadDashboard: true,
      canReadUsers: false,
      canUpdateUserStatus: true,
      canUpdateUserAccessPolicy: true,
      canReadRoles: false,
      canWriteRoles: false,
      canReadAudit: false,
      canReadAuthLoginAnalytics: false,
      canReadFeatureFlags: false,
      canWriteFeatureFlags: false,
      canReadSettings: false,
      canUpdateSettings: false,
      canReadNotificationTemplates: false,
      canWriteNotificationTemplates: false,
      canTestNotificationTemplates: false,
      canReadNotificationSegments: false,
      canWriteNotificationSegments: false,
      canReadNotificationBroadcasts: false,
      canWriteNotificationBroadcasts: false,
      canSendNotificationBroadcasts: false,
      canApproveNotificationBroadcasts: false,
    });
  });

  it('derives canWriteRoles from the admin:roles:write claim', () => {
    const policy = createAdminAccessPolicy({
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: [AdminRolesWritePermission],
    });

    expect(policy.canWriteRoles).toBe(true);
    expect(policy.canReadRoles).toBe(false);
    expect(policy.canAccessAdmin).toBe(true);
  });

  it('fails closed when subject is missing while allowing DB-resolved custom roles', () => {
    expect(
      createAdminAccessPolicy({
        permissions: [AdminManageAllPermission],
        roles: [AdminRole],
      }).canAccessAdmin,
    ).toBe(false);
    expect(
      createAdminAccessPolicy({
        subject: 'user-id',
        permissions: [AdminManageAllPermission],
        roles: ['user'],
      }).canAccessAdmin,
    ).toBe(true);
  });

  it('treats manage-all as a frontend-safe wildcard access claim', () => {
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [AdminManageAllPermission],
      }),
    ).toMatchObject({
      canAccessAdmin: true,
      canReadProfile: true,
      canReadDashboard: true,
      canReadUsers: true,
      canUpdateUserStatus: true,
      canUpdateUserAccessPolicy: true,
      canReadRoles: true,
      canWriteRoles: true,
      canReadAudit: true,
      canReadSettings: true,
      canUpdateSettings: true,
    });
  });

  it('normalizes claim lists', () => {
    expect(normalizeStringList([' admin ', '', 'admin', null])).toEqual(['admin']);
  });

  it('derives a product capability from a composed extension without editing the shared map', () => {
    const policyFor = createAdminAccessPolicyFactory(
      composeAdminCapabilities({
        capabilities: AdminCapabilityPermissions,
        extensions: [{ id: 'agritech', capabilities: { canApproveAgriTech: 'admin:agritech:approve' } }],
      }),
    );

    const policy = policyFor({
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: ['admin:agritech:approve'],
    });

    expect(policy.canApproveAgriTech).toBe(true);
    expect(policy.canReadUsers).toBe(false);
    expect(policy.canAccessAdmin).toBe(true);
  });

  it('grants composed product capabilities through the manage-all wildcard', () => {
    const policyFor = createAdminAccessPolicyFactory(
      composeAdminCapabilities({
        capabilities: AdminCapabilityPermissions,
        extensions: [{ id: 'agritech', capabilities: { canReadAgriTech: 'admin:agritech:read' } }],
      }),
    );

    expect(
      policyFor({ subject: 'admin-id', roles: [AdminRole], permissions: [AdminManageAllPermission] }).canReadAgriTech,
    ).toBe(true);
  });

  it('rejects an extension that redefines a shared capability', () => {
    expect(() =>
      composeAdminCapabilities({
        capabilities: AdminCapabilityPermissions,
        extensions: [{ id: 'agritech', capabilities: { canReadUsers: 'admin:agritech:read' } }],
      }),
    ).toThrow('admin access-policy extension "agritech" redefines capability "canReadUsers"');
  });

  it('rejects an extension that maps a capability to a blank permission', () => {
    expect(() =>
      composeAdminCapabilities({
        capabilities: AdminCapabilityPermissions,
        extensions: [{ id: 'agritech', capabilities: { canReadAgriTech: '  ' } }],
      }),
    ).toThrow('admin access-policy extension "agritech" maps capability "canReadAgriTech" to a blank permission');
  });

  it('rejects two extensions that claim the same capability', () => {
    expect(() =>
      composeAdminCapabilities({
        capabilities: AdminCapabilityPermissions,
        extensions: [
          { id: 'agritech', capabilities: { canReadAgriTech: 'admin:agritech:read' } },
          { id: 'logistics', capabilities: { canReadAgriTech: 'admin:logistics:read' } },
        ],
      }),
    ).toThrow('admin access-policy extension "logistics" redefines capability "canReadAgriTech"');
  });

  it('keeps the shared capability map aligned with the default policy flags', () => {
    const policy = createAdminAccessPolicy();

    expect(Object.keys(AdminCapabilityPermissions).sort()).toEqual(
      Object.keys(policy)
        .filter((key) => key.startsWith('can') && key !== 'canAccessAdmin')
        .sort(),
    );
  });

  it('throws when the principal cannot read the admin profile', () => {
    expect(() => {
      assertCanReadAdminProfile();
    }).toThrow('Admin profile permission is required.');
    expect(() => {
      assertCanReadAdminProfile({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [AdminProfileReadPermission],
      });
    }).not.toThrow();
  });
});
