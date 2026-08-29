// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it, vi } from 'vitest';
import type { ClientSession, Collection, Db } from 'mongodb';
import { AuthMongoCollections } from './auth-mongo.collections';
import { reconcileMongoDirectPermissions, reconcileMongoUserRoles } from './auth-mongo-rbac.repository';

function createDatabase() {
  const usersFindOne = vi.fn(() => Promise.resolve(null));
  const rolesFind = vi.fn();
  const userRolesFind = vi.fn();
  const userRolesUpdateOne = vi.fn();
  const userRolesDeleteMany = vi.fn();
  const permissionsFind = vi.fn();
  const userPermissionsFind = vi.fn();
  const userPermissionsUpdateOne = vi.fn();
  const userPermissionsDeleteMany = vi.fn();
  const collections: Record<string, Partial<Collection>> = {
    [AuthMongoCollections.users]: { findOne: usersFindOne },
    [AuthMongoCollections.roles]: { find: rolesFind },
    [AuthMongoCollections.userRoles]: {
      find: userRolesFind,
      updateOne: userRolesUpdateOne,
      deleteMany: userRolesDeleteMany,
    },
    [AuthMongoCollections.permissions]: { find: permissionsFind },
    [AuthMongoCollections.userPermissions]: {
      find: userPermissionsFind,
      updateOne: userPermissionsUpdateOne,
      deleteMany: userPermissionsDeleteMany,
    },
  };
  return {
    database: { collection: (name: string) => collections[name] } as unknown as Db,
    permissionsFind,
    rolesFind,
    userPermissionsDeleteMany,
    userPermissionsFind,
    userPermissionsUpdateOne,
    userRolesDeleteMany,
    userRolesFind,
    userRolesUpdateOne,
    usersFindOne,
  };
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const session = {} as ClientSession;

describe('Mongo RBAC tenant ownership predicates', () => {
  it('does not reconcile roles for a user outside the tenant', async () => {
    const mocks = createDatabase();

    await expect(reconcileMongoUserRoles(mocks.database, tenantId, userId, ['admin'], null, session)).resolves.toEqual(
      [],
    );

    expect(mocks.usersFindOne).toHaveBeenCalledWith({ _id: userId, tenantId }, { session });
    expect(mocks.rolesFind).not.toHaveBeenCalled();
    expect(mocks.userRolesFind).not.toHaveBeenCalled();
    expect(mocks.userRolesUpdateOne).not.toHaveBeenCalled();
    expect(mocks.userRolesDeleteMany).not.toHaveBeenCalled();
  });

  it('does not reconcile direct permissions for a user outside the tenant', async () => {
    const mocks = createDatabase();

    await expect(
      reconcileMongoDirectPermissions(mocks.database, tenantId, userId, ['admin:audit:read'], null, session),
    ).resolves.toBeUndefined();

    expect(mocks.usersFindOne).toHaveBeenCalledWith({ _id: userId, tenantId }, { session });
    expect(mocks.permissionsFind).not.toHaveBeenCalled();
    expect(mocks.userPermissionsFind).not.toHaveBeenCalled();
    expect(mocks.userPermissionsUpdateOne).not.toHaveBeenCalled();
    expect(mocks.userPermissionsDeleteMany).not.toHaveBeenCalled();
  });
});
