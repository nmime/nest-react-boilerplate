/* eslint-disable no-await-in-loop -- ordered upserts preserve deterministic RBAC reconciliation */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { defaultRolePermissions, roleKeys } from '@app/common-authz';
import {
  DefaultAuthTenantId,
  type AuthPermissionRecord,
  type AuthRepositoryError,
  type AuthRoleRecord,
  type AuthRoleRepositoryPort,
  type AuthRoleWithPermissions,
  type AuthUserRoleRepositoryPort,
} from '@app/backend-feature-auth-shared';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';
import { AuthMongoCollections, reconcileManagedRolePermissions } from './auth-mongo.collections';
import {
  collection,
  repositoryResult,
  serializeTenant,
  sessionFrom,
  withoutId,
  type MongoAuthDocument,
} from './auth-mongo.util';
import { resolveMongoEffectiveAccess } from './auth-mongo-user.repository';

@Injectable()
export class MongoAuthUserRoleRepository implements AuthUserRoleRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  assignRoles(input: {
    userId: string;
    tenantId?: string;
    roleKeys: readonly string[];
    grantedByUserId?: string | null;
  }): ResultAsync<string[], AuthRepositoryError> {
    return repositoryResult(
      runInMongoTransaction(this.client, (session) =>
        reconcileMongoUserRoles(
          this.database,
          input.tenantId ?? DefaultAuthTenantId,
          input.userId,
          input.roleKeys,
          input.grantedByUserId ?? null,
          session,
        ),
      ),
    );
  }
  listRoleKeys(userId: string, tenantId = DefaultAuthTenantId): ResultAsync<string[], AuthRepositoryError> {
    return repositoryResult(
      resolveMongoEffectiveAccess(this.database, userId, tenantId).then((access) => access.roleKeys),
    );
  }
  resolveEffectiveAccess(
    userId: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<{ roleKeys: string[]; permissionKeys: string[] }, AuthRepositoryError> {
    return repositoryResult(resolveMongoEffectiveAccess(this.database, userId, tenantId));
  }
}

@Injectable()
export class MongoAuthRoleRepository implements AuthRoleRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  findByKey(
    key: string,
    tenantId = DefaultAuthTenantId,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord | null, AuthRepositoryError> {
    return repositoryResult(this.one({ key, tenantId }, sessionFrom(transaction)));
  }
  findByKeys(
    keys: readonly string[],
    tenantId = DefaultAuthTenantId,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord[], AuthRepositoryError> {
    return repositoryResult(
      this.many({ _id: { $exists: true }, tenantId, key: { $in: [...new Set(keys)] } }, sessionFrom(transaction)),
    );
  }
  findById(
    id: string,
    tenantId = DefaultAuthTenantId,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord | null, AuthRepositoryError> {
    return repositoryResult(this.one({ _id: id, tenantId }, sessionFrom(transaction)));
  }
  listPermissions(transaction?: unknown): ResultAsync<AuthPermissionRecord[], AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.permissions)
        .find({}, { session: sessionFrom(transaction) })
        .sort({ key: 1 })
        .toArray()
        .then((items) => items.map((item) => withoutId(item) as AuthPermissionRecord)),
    );
  }
  findPermissionsByKeys(
    keys: readonly string[],
    transaction?: unknown,
  ): ResultAsync<AuthPermissionRecord[], AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.permissions)
        .find({ key: { $in: [...new Set(keys)] } }, { session: sessionFrom(transaction) })
        .toArray()
        .then((items) => items.map((item) => withoutId(item) as AuthPermissionRecord)),
    );
  }
  listRolesWithPermissions(
    tenantId = DefaultAuthTenantId,
    transaction?: unknown,
  ): ResultAsync<AuthRoleWithPermissions[], AuthRepositoryError> {
    return repositoryResult(this.rolesWithPermissions(tenantId, sessionFrom(transaction)));
  }
  createRole(
    input: { tenantId?: string; key: string; label?: string; description?: string; isSystem?: boolean },
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord, AuthRepositoryError> {
    return repositoryResult(this.create(input, sessionFrom(transaction)));
  }
  updateRole(
    id: string,
    input: { label?: string; description?: string },
    tenantId = DefaultAuthTenantId,
    transaction?: unknown,
  ): ResultAsync<AuthRoleRecord | null, AuthRepositoryError> {
    return repositoryResult(this.update(id, input, tenantId, sessionFrom(transaction)));
  }
  setRolePermissions(
    id: string,
    permissionKeys: readonly string[],
    tenantId = DefaultAuthTenantId,
    actorUserId?: string,
    transaction?: unknown,
  ): ResultAsync<AuthRoleWithPermissions | null, AuthRepositoryError> {
    const session = sessionFrom(transaction);
    return repositoryResult(
      session
        ? this.setPermissions(id, permissionKeys, tenantId, actorUserId, session)
        : runInMongoTransaction(this.client, (active) =>
            this.setPermissions(id, permissionKeys, tenantId, actorUserId, active),
          ),
    );
  }

  private async one(filter: Record<string, unknown>, session?: ClientSession): Promise<AuthRoleRecord | null> {
    const item = await collection(this.database, AuthMongoCollections.roles).findOne(filter, { session });
    return item ? (withoutId(item) as AuthRoleRecord) : null;
  }
  private async many(filter: Record<string, unknown>, session?: ClientSession): Promise<AuthRoleRecord[]> {
    const items = await collection(this.database, AuthMongoCollections.roles)
      .find(filter, { session })
      .sort({ key: 1 })
      .toArray();
    return items.map((item) => withoutId(item) as AuthRoleRecord);
  }
  private async rolesWithPermissions(tenantId: string, session?: ClientSession): Promise<AuthRoleWithPermissions[]> {
    const roles = await this.many({ tenantId }, session);
    const roleIds = roles.map((role) => role.id);
    const grants = roleIds.length
      ? await collection(this.database, AuthMongoCollections.rolePermissions)
          .find({ roleId: { $in: roleIds } }, { session })
          .toArray()
      : [];
    const permissionIds = [...new Set(grants.map((grant) => String(grant.permissionId)))];
    const permissions = permissionIds.length
      ? await collection(this.database, AuthMongoCollections.permissions)
          .find({ _id: { $in: permissionIds } }, { session })
          .toArray()
      : [];
    const keyById = new Map(permissions.map((item) => [item._id, String(item.key)]));
    return roles.map((role) => ({
      role,
      permissionKeys: grants
        .filter((grant) => grant.roleId === role.id)
        .map((grant) => keyById.get(String(grant.permissionId)))
        .filter((key): key is string => Boolean(key)),
    }));
  }
  private async create(
    input: { tenantId?: string; key: string; label?: string; description?: string; isSystem?: boolean },
    session?: ClientSession,
  ): Promise<AuthRoleRecord> {
    const now = new Date();
    const item: MongoAuthDocument = {
      _id: randomUUID(),
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      key: input.key,
      label: input.label ?? '',
      description: input.description ?? '',
      isSystem: input.isSystem ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await collection(this.database, AuthMongoCollections.roles).insertOne(item, { session });
    return withoutId(item) as AuthRoleRecord;
  }
  private async update(
    id: string,
    input: { label?: string; description?: string },
    tenantId: string,
    session?: ClientSession,
  ): Promise<AuthRoleRecord | null> {
    const item = await collection(this.database, AuthMongoCollections.roles).findOneAndUpdate(
      { _id: id, tenantId },
      {
        $set: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        },
      },
      { session, returnDocument: 'after', includeResultMetadata: false },
    );
    return item ? (withoutId(item) as AuthRoleRecord) : null;
  }
  private async setPermissions(
    id: string,
    keys: readonly string[],
    tenantId: string,
    actorUserId: string | undefined,
    session: ClientSession,
  ): Promise<AuthRoleWithPermissions | null> {
    await serializeTenant(this.database, tenantId, session);
    const role = await this.one({ _id: id, tenantId }, session);
    if (!role) {
      return null;
    }
    const actorBefore = actorUserId ? await powerfulUser(this.database, actorUserId, tenantId, session) : false;
    const permissions = await collection(this.database, AuthMongoCollections.permissions)
      .find({ key: { $in: [...new Set(keys)] } }, { session })
      .toArray();
    const desired = new Set(permissions.map((item) => item._id));
    const existing = await collection(this.database, AuthMongoCollections.rolePermissions)
      .find({ roleId: id }, { session })
      .toArray();
    for (const permission of permissions) {
      const managed = role.isSystem && defaultPermissionKeys(role.key).has(String(permission.key));
      await collection(this.database, AuthMongoCollections.rolePermissions).updateOne(
        { roleId: id, permissionId: permission._id },
        {
          $setOnInsert: {
            _id: randomUUID(),
            roleId: id,
            permissionId: permission._id,
            managed,
            createdAt: new Date(),
          },
        },
        { upsert: true, session },
      );
    }
    const removed = existing.filter((item) => !desired.has(String(item.permissionId))).map((item) => item._id);
    if (removed.length) {
      await collection(this.database, AuthMongoCollections.rolePermissions).deleteMany(
        { _id: { $in: removed } },
        { session },
      );
    }
    const updatedAt = new Date();
    await collection(this.database, AuthMongoCollections.roles).updateOne(
      { _id: id, tenantId },
      { $set: { updatedAt } },
      { session },
    );
    if (actorUserId && actorBefore && !(await powerfulUser(this.database, actorUserId, tenantId, session))) {
      throw new Error('Administrators cannot remove their own active admin write access.');
    }
    if (actorUserId && (await countPowerfulUsers(this.database, tenantId, session)) === 0) {
      throw new Error('At least one active administrator must retain admin write access.');
    }
    return { role: { ...role, updatedAt }, permissionKeys: permissions.map((item) => String(item.key)) };
  }
}

export async function ensureMongoTenantRbac(database: Db, tenantId: string, session: ClientSession): Promise<void> {
  const now = new Date();
  const roles = collection(database, AuthMongoCollections.roles);
  for (const key of roleKeys) {
    const role = await roles.findOneAndUpdate(
      { tenantId, key },
      {
        $setOnInsert: {
          _id: randomUUID(),
          tenantId,
          key,
          label: key,
          description: '',
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, session, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!role) {
      throw new Error('MongoDB tenant RBAC initialization failed.');
    }
    await reconcileManagedRolePermissions(database, role._id, defaultRolePermissions[key], now, session);
  }
}

export async function reconcileMongoUserRoles(
  database: Db,
  tenantId: string,
  userId: string,
  keys: readonly string[],
  grantedByUserId: string | null,
  session: ClientSession,
): Promise<string[]> {
  await ensureMongoTenantRbac(database, tenantId, session);
  const roles = await collection(database, AuthMongoCollections.roles)
    .find({ tenantId, key: { $in: [...new Set(keys)] } }, { session })
    .toArray();
  const desired = new Set(roles.map((role) => role._id));
  const existing = await collection(database, AuthMongoCollections.userRoles)
    .find({ tenantId, userId }, { session })
    .toArray();
  for (const role of roles) {
    await collection(database, AuthMongoCollections.userRoles).updateOne(
      { tenantId, userId, roleId: role._id },
      {
        $setOnInsert: { _id: randomUUID(), tenantId, userId, roleId: role._id, grantedByUserId, createdAt: new Date() },
      },
      { upsert: true, session },
    );
  }
  const removed = existing.filter((item) => !desired.has(String(item.roleId))).map((item) => item._id);
  if (removed.length) {
    await collection(database, AuthMongoCollections.userRoles).deleteMany({ _id: { $in: removed } }, { session });
  }
  return roles.map((role) => String(role.key));
}

export async function reconcileMongoDirectPermissions(
  database: Db,
  tenantId: string,
  userId: string,
  keys: readonly string[],
  grantedByUserId: string | null,
  session: ClientSession,
): Promise<void> {
  const permissions = await collection(database, AuthMongoCollections.permissions)
    .find({ key: { $in: [...new Set(keys)] } }, { session })
    .toArray();
  const desired = new Set(permissions.map((item) => item._id));
  const existing = await collection(database, AuthMongoCollections.userPermissions)
    .find({ tenantId, userId }, { session })
    .toArray();
  for (const permission of permissions) {
    await collection(database, AuthMongoCollections.userPermissions).updateOne(
      { tenantId, userId, permissionId: permission._id },
      {
        $setOnInsert: {
          _id: randomUUID(),
          tenantId,
          userId,
          permissionId: permission._id,
          grantedByUserId,
          createdAt: new Date(),
        },
      },
      { upsert: true, session },
    );
  }
  const removed = existing.filter((item) => !desired.has(String(item.permissionId))).map((item) => item._id);
  if (removed.length) {
    await collection(database, AuthMongoCollections.userPermissions).deleteMany({ _id: { $in: removed } }, { session });
  }
}

export async function resolveMongoInheritedPermissions(
  database: Db,
  tenantId: string,
  userId: string,
  session: ClientSession,
): Promise<string[]> {
  const assignments = await collection(database, AuthMongoCollections.userRoles)
    .find({ tenantId, userId }, { session })
    .toArray();
  const roleIds = assignments.map((item) => String(item.roleId));
  if (!roleIds.length) {
    return [];
  }
  const grants = await collection(database, AuthMongoCollections.rolePermissions)
    .find({ roleId: { $in: roleIds } }, { session })
    .toArray();
  const permissionIds = [...new Set(grants.map((item) => String(item.permissionId)))];
  if (!permissionIds.length) {
    return [];
  }
  const permissions = await collection(database, AuthMongoCollections.permissions)
    .find({ _id: { $in: permissionIds } }, { session })
    .toArray();
  return permissions.map((item) => String(item.key));
}

const powerfulUser = async (
  database: Db,
  userId: string,
  tenantId: string,
  session: ClientSession,
): Promise<boolean> => {
  const user = await collection(database, AuthMongoCollections.users).findOne({ _id: userId, tenantId }, { session });
  if (!user || user.status !== 'active') {
    return false;
  }
  const access = await resolveMongoEffectiveAccess(database, userId, tenantId, session);
  return (
    access.permissionKeys.includes('admin:users:write') &&
    access.permissionKeys.includes('admin:users:access-policy:update')
  );
};
export const countPowerfulUsers = async (database: Db, tenantId: string, session: ClientSession): Promise<number> => {
  const users = await collection(database, AuthMongoCollections.users)
    .find({ tenantId, status: 'active' }, { session })
    .toArray();
  let powerful = 0;
  for (const user of users) {
    // MongoDB sessions do not support parallel operations inside a transaction.
    if (await powerfulUser(database, user._id, tenantId, session)) {
      powerful += 1;
    }
  }
  return powerful;
};

function defaultPermissionKeys(roleKey: string): ReadonlySet<string> {
  const key = roleKeys.find((candidate) => candidate === roleKey);
  return new Set(key ? defaultRolePermissions[key] : []);
}
