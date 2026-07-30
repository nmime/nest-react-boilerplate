// @requirements REQ-AUTH-CREDENTIAL-003
import { describe, expect, it } from 'vitest';
import {
  createDefaultAccessPolicy,
  DefaultAuthTenantId,
  normalizeUserThemePreference,
  permissionsForRoles,
  UserProfileReadPermission,
  toAuthenticatedUserView,
  UserRole,
  AdminRole,
} from './index';

describe('auth shared', () => {
  it('creates default user and bootstrap admin access policies', () => {
    expect(createDefaultAccessPolicy('user@example.com', {})).toEqual({
      roles: [UserRole],
      permissions: [UserProfileReadPermission],
    });
    expect(
      createDefaultAccessPolicy('Admin@Example.com', {
        ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com,other@example.com',
      }),
    ).toEqual({
      roles: [UserRole],
      permissions: [UserProfileReadPermission],
    });
    expect(
      createDefaultAccessPolicy('Admin@Example.com', {
        ADMIN_BOOTSTRAP_ENABLED: 'true',
        ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com,other@example.com',
      }),
    ).toEqual({
      roles: [UserRole, AdminRole],
      permissions: permissionsForRoles([UserRole, AdminRole]),
    });
  });

  it('normalizes authenticated user views', () => {
    expect(
      toAuthenticatedUserView({
        id: 'id',
        email: 'user@example.com',
        displayName: 'User',
        locale: 'ru',
        theme: 'dark',
        roles: ['user', 'user'],
        permissions: ['profile:read', ''],
      }),
    ).toEqual({
      id: 'id',
      tenantId: DefaultAuthTenantId,
      email: 'user@example.com',
      displayName: 'User',
      locale: 'ru',
      theme: 'dark',
      roles: ['user'],
      permissions: ['profile:read'],
    });
    expect(toAuthenticatedUserView({ id: 'id', email: 'e' })).toEqual({
      id: 'id',
      tenantId: DefaultAuthTenantId,
      email: 'e',
      theme: 'system',
      roles: [],
      permissions: [],
    });
  });

  it('normalizes supported theme preferences', () => {
    expect(normalizeUserThemePreference('Dark')).toBe('dark');
    expect(normalizeUserThemePreference('system')).toBe('system');
    expect(normalizeUserThemePreference('sepia')).toBeUndefined();
  });
});
