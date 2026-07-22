import { okAsync, type ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { UserProfileReadPermission } from '@app/common-authz';
import { AdminUsersUseCase } from './admin-users.use-case';

const tenantId = '00000000-0000-0000-0000-000000000000';

const principal: AuthenticatedPrincipal = {
  subject: 'actor-id',
  tenantId,
  email: 'admin@example.com',
  roles: ['admin'],
  permissions: [],
};

const context = { requestId: 'req-1' };

const createUser = () => ({
  id: 'user-id',
  tenantId,
  email: 'user@example.com',
  displayName: 'User',
  status: 'active' as const,
  roles: ['user'],
  permissions: [UserProfileReadPermission],
  locale: 'en',
  theme: 'system',
  lastLoginAt: new Date('2026-01-04T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
});

type TestResult<T> = ResultAsync<T, { code: string; message: string }>;

const createDeps = () => {
  const users = {
    findById: vi.fn((): TestResult<ReturnType<typeof createUser> | null> => okAsync(createUser())),
    listUsers: vi.fn(() => okAsync([createUser()])),
    countUsers: vi.fn(() => okAsync(1)),
  };
  const auditLogs = {
    list: vi.fn(() => okAsync([])),
    count: vi.fn(() => okAsync(0)),
  };
  const adminUserMutations = {
    mutateAccessPolicyWithAudit: vi.fn(
      (): TestResult<{ before: ReturnType<typeof createUser>; after: ReturnType<typeof createUser> } | null> =>
        okAsync({ before: createUser(), after: createUser() }),
    ),
  };
  const roles = {
    findByKeys: vi.fn(() => okAsync([{ key: 'user' }])),
    findPermissionsByKeys: vi.fn((keys: readonly string[]) => okAsync(keys.map((key) => ({ key })))),
  };

  return {
    users,
    auditLogs,
    adminUserMutations,
    roles,
    useCase: new AdminUsersUseCase(users as never, auditLogs as never, adminUserMutations as never, roles as never),
  };
};

describe('AdminUsersUseCase', () => {
  it('returns the mapped view for an existing user', async () => {
    const { useCase } = createDeps();

    await expect(useCase.getUser(principal, 'user-id')).resolves.toMatchObject({
      id: 'user-id',
      email: 'user@example.com',
    });
  });

  it('throws not_found when the user is missing', async () => {
    const { users, useCase } = createDeps();
    users.findById.mockReturnValue(okAsync(null));

    await expect(useCase.getUser(principal, 'missing')).rejects.toThrow(/was not found/);
  });

  it('throws not_found when a status mutation resolves to no record', async () => {
    const { adminUserMutations, useCase } = createDeps();
    adminUserMutations.mutateAccessPolicyWithAudit.mockReturnValue(okAsync(null));

    await expect(
      useCase.updateUserStatus(principal, 'missing', { status: 'disabled', reason: 'Disable account' }, context),
    ).rejects.toThrow(/was not found/);
  });

  it('throws not_found when an access-policy mutation resolves to no record', async () => {
    const { adminUserMutations, useCase } = createDeps();
    adminUserMutations.mutateAccessPolicyWithAudit.mockReturnValue(okAsync(null));

    await expect(
      useCase.updateUserAccessPolicy(
        principal,
        'missing',
        { roles: ['user'], permissions: [UserProfileReadPermission], reason: 'Reset access' },
        context,
      ),
    ).rejects.toThrow(/was not found/);
  });

  it('refuses an access policy when a catalog permission was not seeded in the database', async () => {
    const { adminUserMutations, roles, useCase } = createDeps();
    roles.findPermissionsByKeys.mockReturnValue(okAsync([]));

    await expect(
      useCase.updateUserAccessPolicy(
        principal,
        'user-id',
        { roles: ['user'], permissions: [UserProfileReadPermission], reason: 'Reset access' },
        context,
      ),
    ).rejects.toThrow(/permission catalog is missing database rows/i);
    expect(adminUserMutations.mutateAccessPolicyWithAudit).not.toHaveBeenCalled();
  });
});
