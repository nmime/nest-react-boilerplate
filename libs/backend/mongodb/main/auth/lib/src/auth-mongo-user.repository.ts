import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { defaultLocale, type Locale } from '@app/backend-common-i18n';
import { permissionCatalog, roleKeys } from '@app/common-authz';
import {
  DefaultAuthTenantId,
  type AuthRepositoryError,
  type AuthUserAvatarStatus,
  type AuthUserCreateInput,
  type AuthUserListInput,
  type AuthUserPersistenceRecord,
  type AuthUserRepositoryPort,
  type AuthUserThemePreference,
} from '@app/backend-feature-auth-shared';
import type { Db, Filter, UpdateFilter } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { MongoDatabaseToken } from './mongo-runtime';
import { AuthMongoCollections } from './auth-mongo.collections';
import { collection, pageLimit, pageOffset, repositoryResult, type MongoAuthDocument } from './auth-mongo.util';

@Injectable()
export class MongoAuthUserRepository implements AuthUserRepositoryPort {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  createUser(input: AuthUserCreateInput): ResultAsync<AuthUserPersistenceRecord, AuthRepositoryError> {
    return repositoryResult(this.create(input));
  }
  findByEmail(
    email: string | null | undefined,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    const normalized = email?.trim().toLowerCase();
    return repositoryResult(normalized ? this.findOne({ tenantId, email: normalized }) : Promise.resolve(null));
  }
  findById(
    id: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(this.findOne({ _id: id, tenantId }));
  }
  listUsers(input: AuthUserListInput = {}): ResultAsync<AuthUserPersistenceRecord[], AuthRepositoryError> {
    return repositoryResult(this.list(input, true));
  }
  countUsers(input: AuthUserListInput = {}): ResultAsync<number, AuthRepositoryError> {
    return repositoryResult(this.list(input, false).then((items) => items.length));
  }
  setLocale(
    id: string,
    locale: Locale,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return this.setPreferences(id, { locale }, tenantId);
  }
  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: AuthUserThemePreference },
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(this.update(id, tenantId, preferences));
  }
  recordLogin(
    id: string,
    loggedInAt = new Date(),
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(this.update(id, tenantId, { lastLoginAt: loggedInAt }));
  }
  setAvatar(
    id: string,
    input: { url: string; hash: string; status: AuthUserAvatarStatus },
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(
      this.update(id, tenantId, { avatarUrl: input.url, avatarHash: input.hash, avatarStatus: input.status }),
    );
  }
  deleteAvatar(
    id: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(this.update(id, tenantId, { avatarUrl: '', avatarHash: '', avatarStatus: 'deleted' }));
  }
  syncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(this.syncAvatar(id, tenantId, input));
  }
  verifyEmail(
    id: string,
    tenantId = DefaultAuthTenantId,
    verifiedAt: Date = new Date(),
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(this.update(id, tenantId, { emailVerifiedAt: verifiedAt }));
  }
  replacePassword(
    id: string,
    passwordHash: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthUserPersistenceRecord | null, AuthRepositoryError> {
    // `$inc` rather than a read-then-write: two resets racing on one account must each advance the
    // epoch, or the loser silently leaves the sessions it was meant to revoke alive.
    return repositoryResult(this.mutate(id, tenantId, { $set: { passwordHash }, $inc: { credentialRevision: 1 } }));
  }

  private async create(input: AuthUserCreateInput): Promise<AuthUserPersistenceRecord> {
    const now = new Date();
    const document: MongoAuthDocument = {
      _id: randomUUID(),
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      email: input.email?.trim().toLowerCase() || null,
      displayName: input.displayName ?? '',
      passwordHash: input.passwordHash ?? '',
      status: input.status ?? 'active',
      locale: input.locale ?? defaultLocale,
      theme: input.theme ?? 'system',
      lastLoginAt: input.lastLoginAt ?? new Date(0),
      avatarUrl: input.avatarUrl ?? '',
      avatarHash: input.avatarHash ?? '',
      avatarStatus: input.avatarStatus ?? 'none',
      emailVerifiedAt: null,
      credentialRevision: 0,
      createdAt: now,
      updatedAt: now,
    };
    await collection(this.database, AuthMongoCollections.users).insertOne(document);
    return toMongoAuthUserRecord(this.database, document);
  }
  private async findOne(filter: Filter<MongoAuthDocument>): Promise<AuthUserPersistenceRecord | null> {
    const document = await collection(this.database, AuthMongoCollections.users).findOne(filter);
    return document ? toMongoAuthUserRecord(this.database, document) : null;
  }
  private async list(input: AuthUserListInput, paginate: boolean): Promise<AuthUserPersistenceRecord[]> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const filter: Filter<MongoAuthDocument> = { tenantId };
    if (input.status) {
      filter.status = input.status;
    }
    if (input.locale) {
      filter.locale = input.locale;
    }
    if (input.createdAfter || input.createdBefore) {
      filter.createdAt = {
        ...(input.createdAfter ? { $gte: input.createdAfter } : {}),
        ...(input.createdBefore ? { $lte: input.createdBefore } : {}),
      };
    }
    if (input.lastLoginAfter || input.lastLoginBefore) {
      filter.lastLoginAt = {
        ...(input.lastLoginAfter ? { $gte: input.lastLoginAfter } : {}),
        ...(input.lastLoginBefore ? { $lte: input.lastLoginBefore } : {}),
      };
    }
    if (input.search) {
      filter.$or = [
        { email: { $regex: escapeRegex(input.search), $options: 'i' } },
        { displayName: { $regex: escapeRegex(input.search), $options: 'i' } },
      ];
    }
    const documents = await collection(this.database, AuthMongoCollections.users)
      .find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .toArray();
    const hydrated = await Promise.all(documents.map((item) => toMongoAuthUserRecord(this.database, item)));
    const filtered = hydrated.filter(
      (item) =>
        (!input.role || item.roles.includes(input.role)) &&
        (!input.permission || item.permissions.includes(input.permission)),
    );
    return paginate
      ? filtered.slice(pageOffset(input.offset), pageOffset(input.offset) + pageLimit(input.limit))
      : filtered;
  }
  private update(
    id: string,
    tenantId: string,
    changes: Record<string, unknown>,
  ): Promise<AuthUserPersistenceRecord | null> {
    return this.mutate(id, tenantId, { $set: changes });
  }
  private async mutate(
    id: string,
    tenantId: string,
    update: UpdateFilter<MongoAuthDocument>,
  ): Promise<AuthUserPersistenceRecord | null> {
    const document = await collection(this.database, AuthMongoCollections.users).findOneAndUpdate(
      { _id: id, tenantId },
      { ...update, $set: { ...update.$set, updatedAt: new Date() } },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return document ? toMongoAuthUserRecord(this.database, document) : null;
  }
  private async syncAvatar(
    id: string,
    tenantId: string,
    input: { url: string | null; hash: string | null },
  ): Promise<AuthUserPersistenceRecord | null> {
    const current = await collection(this.database, AuthMongoCollections.users).findOne({ _id: id, tenantId });
    if (!current) {
      return null;
    }
    if (
      current.avatarStatus === 'manual' ||
      current.avatarStatus === 'deleted' ||
      current.avatarHash === (input.hash ?? '')
    ) {
      return toMongoAuthUserRecord(this.database, current);
    }
    return this.update(id, tenantId, {
      avatarUrl: input.url ?? '',
      avatarHash: input.hash ?? '',
      avatarStatus: input.url ? 'provider' : 'none',
    });
  }
}

export async function toMongoAuthUserRecord(
  database: Db,
  document: MongoAuthDocument,
  session?: import('mongodb').ClientSession,
): Promise<AuthUserPersistenceRecord> {
  const access = await resolveMongoEffectiveAccess(database, document._id, String(document.tenantId), session);
  return {
    id: document._id,
    tenantId: String(document.tenantId),
    email: document.email as string | null,
    displayName: String(document.displayName),
    passwordHash: String(document.passwordHash),
    status: document.status as AuthUserPersistenceRecord['status'],
    roles: access.roleKeys,
    permissions: access.permissionKeys,
    locale: document.locale as Locale,
    theme: document.theme as AuthUserThemePreference,
    lastLoginAt: document.lastLoginAt as Date,
    avatarUrl: String(document.avatarUrl),
    avatarHash: String(document.avatarHash),
    avatarStatus: document.avatarStatus as AuthUserAvatarStatus,
    // Documents written before account recovery existed carry neither field. Absent reads as never
    // verified at revision zero, which is exactly what sessions minted back then claim.
    emailVerifiedAt: (document.emailVerifiedAt as Date | null | undefined) ?? null,
    credentialRevision: Number(document.credentialRevision ?? 0),
    createdAt: document.createdAt as Date,
    updatedAt: document.updatedAt as Date,
  };
}

export async function resolveMongoEffectiveAccess(
  database: Db,
  userId: string,
  tenantId: string,
  session?: import('mongodb').ClientSession,
): Promise<{ roleKeys: string[]; permissionKeys: string[] }> {
  const options = { session };
  const assignments = await collection(database, AuthMongoCollections.userRoles)
    .find({ userId, tenantId }, options)
    .toArray();
  const roleIds = assignments.map((item) => String(item.roleId));
  const roles = roleIds.length
    ? await collection(database, AuthMongoCollections.roles)
        .find({ _id: { $in: roleIds }, tenantId }, options)
        .toArray()
    : [];
  const grants = roleIds.length
    ? await collection(database, AuthMongoCollections.rolePermissions)
        .find({ roleId: { $in: roleIds } }, options)
        .toArray()
    : [];
  const direct = await collection(database, AuthMongoCollections.userPermissions)
    .find({ userId, tenantId }, options)
    .toArray();
  const permissionIds = [
    ...new Set([
      ...grants.map((item) => String(item.permissionId)),
      ...direct.map((item) => String(item.permissionId)),
    ]),
  ];
  const permissions = permissionIds.length
    ? await collection(database, AuthMongoCollections.permissions)
        .find({ _id: { $in: permissionIds } }, options)
        .toArray()
    : [];
  const roleOrder = new Map<string, number>(roleKeys.map((key, index) => [key, index]));
  const permissionOrder = new Map<string, number>(permissionCatalog.map((item, index) => [item.key, index]));
  return {
    roleKeys: roles
      .map((item) => String(item.key))
      .sort((a, b) => (roleOrder.get(a) ?? 999) - (roleOrder.get(b) ?? 999) || a.localeCompare(b)),
    permissionKeys: permissions
      .map((item) => String(item.key))
      .sort((a, b) => (permissionOrder.get(a) ?? 999) - (permissionOrder.get(b) ?? 999) || a.localeCompare(b)),
  };
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
