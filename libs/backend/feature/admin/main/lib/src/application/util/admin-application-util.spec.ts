// @requirements REQ-AUTH-TENANT-004
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  AdminManageAllPermission,
  AdminRolesReadPermission,
  AdminUsersReadPermission,
  UserProfileReadPermission,
} from '@app/common-authz';
import { AdminApplicationError } from '../admin-errors';
import type { AdminRolePermissionView } from '../../domain';
import {
  orderPermissionKeys,
  orderPermissionViews,
  requireAllowedPolicy,
  requireKnownPermissions,
  resolveTenantId,
  unwrapRepositoryResult,
  unwrapSensitiveMutationResult,
} from './index';

const principal: AuthenticatedPrincipal = {
  subject: 'actor-id',
  tenantId: 'tenant-1',
  email: 'admin@example.com',
  roles: [],
  permissions: [],
};

describe('resolveTenantId', () => {
  it('returns the principal tenant id', () => {
    expect(resolveTenantId(principal)).toBe('tenant-1');
  });
});

describe('unwrapRepositoryResult', () => {
  it('returns the value for an ok result', () => {
    expect(unwrapRepositoryResult(ok(42))).toBe(42);
  });

  it('throws a repository_error carrying the error message', () => {
    expect(() => unwrapRepositoryResult(err({ message: 'db exploded' }))).toThrow(
      new AdminApplicationError('repository_error', 'db exploded'),
    );
  });

  it('falls back to a default message when none is provided', () => {
    try {
      unwrapRepositoryResult(err({}));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AdminApplicationError);
      expect((error as AdminApplicationError).code).toBe('repository_error');
      expect((error as AdminApplicationError).message).toBe('Admin repository operation failed.');
    }
  });
});

describe('unwrapSensitiveMutationResult', () => {
  it('returns the value for an ok result', () => {
    expect(unwrapSensitiveMutationResult(ok('done'))).toBe('done');
  });

  it('maps a recognized safety message to a sensitive policy violation', () => {
    try {
      unwrapSensitiveMutationResult(
        err({
          message: 'At least one active administrator must retain admin write access.',
        }),
      );
      expect.unreachable();
    } catch (error) {
      expect((error as AdminApplicationError).code).toBe('sensitive_policy_violation');
    }
  });

  it('maps an unrecognized message to a repository_error', () => {
    try {
      unwrapSensitiveMutationResult(err({ message: 'connection reset' }));
      expect.unreachable();
    } catch (error) {
      expect((error as AdminApplicationError).code).toBe('repository_error');
      expect((error as AdminApplicationError).message).toBe('connection reset');
    }
  });

  it('falls back to a default repository_error message', () => {
    try {
      unwrapSensitiveMutationResult(err({}));
      expect.unreachable();
    } catch (error) {
      expect((error as AdminApplicationError).code).toBe('repository_error');
      expect((error as AdminApplicationError).message).toBe('Admin repository operation failed.');
    }
  });
});

describe('requireAllowedPolicy', () => {
  it('accepts roles and permissions inside the admin catalog', () => {
    expect(() => {
      requireAllowedPolicy({
        roles: ['user'],
        permissions: [UserProfileReadPermission],
        reason: 'Test policy update',
      });
    }).not.toThrow();
  });

  it('defers custom role validation to the tenant-backed role repository', () => {
    expect(() => {
      requireAllowedPolicy({ roles: ['owner'], permissions: [], reason: 'Test policy update' });
    }).not.toThrow();
  });

  it('rejects permissions outside the admin catalog', () => {
    expect(() => {
      requireAllowedPolicy({ roles: [], permissions: ['*'], reason: 'Test policy update' });
    }).toThrow(/outside the admin catalog/);
  });

  it('rejects the break-glass admin:manage:all permission even though it is in the catalog', () => {
    expect(() => {
      requireAllowedPolicy({
        roles: ['admin'],
        permissions: [AdminManageAllPermission],
        reason: 'Test policy update',
      });
    }).toThrow(/break-glass/);
  });
});

describe('requireKnownPermissions', () => {
  it('de-duplicates known permission keys', () => {
    expect(
      requireKnownPermissions([AdminUsersReadPermission, AdminUsersReadPermission, AdminRolesReadPermission]),
    ).toEqual([AdminUsersReadPermission, AdminRolesReadPermission]);
  });

  it('returns an empty list unchanged', () => {
    expect(requireKnownPermissions([])).toEqual([]);
  });

  it('rejects unknown permission keys', () => {
    expect(() => requireKnownPermissions(['admin:ghost:read'])).toThrow(/Unknown permission keys/);
  });
});

describe('permission ordering', () => {
  it('orders known catalog permissions ahead of unknown ones', () => {
    expect(orderPermissionKeys(['zzz:unknown:read', AdminUsersReadPermission, UserProfileReadPermission])).toEqual([
      UserProfileReadPermission,
      AdminUsersReadPermission,
      'zzz:unknown:read',
    ]);
  });

  it('falls back to a locale comparison when catalog indices tie', () => {
    // Two keys absent from the catalog share MAX_SAFE_INTEGER, so the
    // tie-break locale comparison decides ordering.
    expect(orderPermissionKeys(['b:unknown:read', 'a:unknown:read'])).toEqual(['a:unknown:read', 'b:unknown:read']);
  });

  it('orders permission views by their catalog position', () => {
    const view = (permission: string): AdminRolePermissionView => ({
      permission,
      resource: permission.split(':')[0] ?? permission,
      action: 'read',
      description: permission,
    });

    expect(
      orderPermissionViews([view('z:unknown:read'), view(AdminUsersReadPermission)]).map((entry) => entry.permission),
    ).toEqual([AdminUsersReadPermission, 'z:unknown:read']);
  });
});
