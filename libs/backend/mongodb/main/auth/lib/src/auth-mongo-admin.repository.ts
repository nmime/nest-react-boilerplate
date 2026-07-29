import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AdminAuditLogTransactionError,
  DefaultAuthTenantId,
  type AdminAuditLogInput,
  type AdminAuditLogListInput,
  type AdminAuditLogRecord,
  type AdminAuditLogRepositoryPort,
  type AdminUserMutationRepositoryPort,
  type AdminUserMutationResult,
  type AuthRepositoryError,
  type AuthUserAccessPolicyInput,
  type AuthUserPersistenceRecord,
  type TransactionalOutboxRecord,
} from '@app/backend-feature-auth-shared';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';
import { AuthMongoCollections } from './auth-mongo.collections';
import {
  collection,
  pageLimit,
  pageOffset,
  repositoryResult,
  serializeTenant,
  withoutId,
  type MongoAuthDocument,
} from './auth-mongo.util';
import {
  countPowerfulUsers,
  reconcileMongoDirectPermissions,
  reconcileMongoUserRoles,
  resolveMongoInheritedPermissions,
} from './auth-mongo-rbac.repository';
import { toMongoAuthUserRecord } from './auth-mongo-user.repository';

@Injectable()
export class MongoAdminAuditLogRepository implements AdminAuditLogRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  record(input: AdminAuditLogInput): ResultAsync<AdminAuditLogRecord, AuthRepositoryError> {
    return repositoryResult(runInMongoTransaction(this.client, (session) => this.persist(input, session)));
  }
  async recordTransactionally<T>(input: {
    operation: (transaction: unknown) => Promise<T>;
    audit: (result: T) => AdminAuditLogInput;
  }): Promise<T> {
    try {
      return await runInMongoTransaction(this.client, async (session) => {
        let result: T;
        try {
          result = await input.operation(session);
        } catch (error) {
          throw new AuditedOperationError(error);
        }
        await this.persist(input.audit(result), session);
        return result;
      });
    } catch (error) {
      if (error instanceof AuditedOperationError) {
        throw error.operationCause;
      }
      throw new AdminAuditLogTransactionError(error);
    }
  }
  list(input: AdminAuditLogListInput = {}): ResultAsync<AdminAuditLogRecord[], AuthRepositoryError> {
    return repositoryResult(this.query(input));
  }
  count(input: AdminAuditLogListInput = {}): ResultAsync<number, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.auditLogs).countDocuments(auditFilter(input)),
    );
  }
  findById(id: string, tenantId = DefaultAuthTenantId): ResultAsync<AdminAuditLogRecord | null, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.auditLogs)
        .findOne({ _id: id, tenantId })
        .then((item) => (item ? (withoutId(item) as AdminAuditLogRecord) : null)),
    );
  }
  private async persist(input: AdminAuditLogInput, session: ClientSession): Promise<AdminAuditLogRecord> {
    const audit = makeAudit(input);
    const outbox = makeOutbox(audit, 'admin-audit-log', audit.targetUserId ?? audit.id);
    await collection(this.database, AuthMongoCollections.auditLogs).insertOne(toDocument(audit), { session });
    await collection(this.database, AuthMongoCollections.outbox).insertOne(toDocument(outbox), { session });
    return audit;
  }
  private async query(input: AdminAuditLogListInput): Promise<AdminAuditLogRecord[]> {
    const items = await collection(this.database, AuthMongoCollections.auditLogs)
      .find(auditFilter(input))
      .sort({ createdAt: -1, _id: -1 })
      .skip(pageOffset(input.offset))
      .limit(pageLimit(input.limit))
      .toArray();
    return items.map((item) => withoutId(item) as AdminAuditLogRecord);
  }
}

@Injectable()
export class MongoAdminUserMutationRepository implements AdminUserMutationRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  mutateAccessPolicyWithAudit(input: {
    tenantId?: string;
    targetUserId: string;
    actorUserId: string;
    policy: AuthUserAccessPolicyInput;
    audit: { actorUserId?: string | null; metadata?: Record<string, unknown> | null };
    action: 'admin.user.status.update' | 'admin.user.access_policy.update' | 'admin.user.roles.update';
  }): ResultAsync<AdminUserMutationResult | null, AuthRepositoryError> {
    return repositoryResult(runInMongoTransaction(this.client, (session) => this.mutate(input, session)));
  }
  mutateUserRolesWithAudit(input: {
    tenantId?: string;
    targetUserId: string;
    actorUserId: string;
    desiredRoleKeys: readonly string[];
    audit: { actorUserId?: string | null; metadata?: Record<string, unknown> | null };
  }): ResultAsync<AdminUserMutationResult | null, AuthRepositoryError> {
    return this.mutateAccessPolicyWithAudit({
      ...input,
      action: 'admin.user.roles.update',
      policy: { roles: [...input.desiredRoleKeys] },
    });
  }
  private async mutate(
    input: {
      tenantId?: string;
      targetUserId: string;
      actorUserId: string;
      policy: AuthUserAccessPolicyInput;
      audit: { actorUserId?: string | null; metadata?: Record<string, unknown> | null };
      action: string;
    },
    session: ClientSession,
  ): Promise<AdminUserMutationResult | null> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    await serializeTenant(this.database, tenantId, session);
    const users = collection(this.database, AuthMongoCollections.users);
    const document = await users.findOne({ _id: input.targetUserId, tenantId }, { session });
    if (!document) {
      return null;
    }
    const before = await toMongoAuthUserRecord(this.database, document, session);
    const powerfulBefore = await countPowerfulUsers(this.database, tenantId, session);
    if (input.policy.roles !== undefined) {
      await reconcileMongoUserRoles(
        this.database,
        tenantId,
        input.targetUserId,
        input.policy.roles,
        input.actorUserId,
        session,
      );
    }
    if (input.policy.permissions !== undefined) {
      const inherited = new Set(
        await resolveMongoInheritedPermissions(this.database, tenantId, input.targetUserId, session),
      );
      await reconcileMongoDirectPermissions(
        this.database,
        tenantId,
        input.targetUserId,
        input.policy.permissions.filter((key) => !inherited.has(key)),
        input.actorUserId,
        session,
      );
    }
    if (input.policy.status !== undefined) {
      await users.updateOne(
        { _id: input.targetUserId, tenantId },
        { $set: { status: input.policy.status, updatedAt: new Date() } },
        { session },
      );
    }
    const afterDocument = await users.findOne({ _id: input.targetUserId, tenantId }, { session });
    if (!afterDocument) {
      return null;
    }
    const after = await toMongoAuthUserRecord(this.database, afterDocument, session);
    const removesPowerful = isPowerful(before) && !isPowerful(after);
    if (input.actorUserId === input.targetUserId && removesPowerful) {
      throw new Error('Administrators cannot remove their own active admin write access.');
    }
    if (removesPowerful && powerfulBefore <= 1) {
      throw new Error('At least one active administrator must retain admin write access.');
    }
    const audit = makeAudit({
      tenantId,
      actorUserId: input.audit.actorUserId ?? input.actorUserId,
      action: input.action as AdminAuditLogInput['action'],
      resource: 'admin.users',
      targetUserId: input.targetUserId,
      before: auditUser(input.action, before),
      after: auditUser(input.action, after),
      metadata: input.audit.metadata ?? {},
    });
    const outbox = makeOutbox(audit, 'admin.user', input.targetUserId, {
      targetUserId: input.targetUserId,
      actorUserId: input.actorUserId,
      before: audit.before,
      after: audit.after,
    });
    await collection(this.database, AuthMongoCollections.auditLogs).insertOne(toDocument(audit), { session });
    await collection(this.database, AuthMongoCollections.outbox).insertOne(toDocument(outbox), { session });
    return { before, after, auditLog: audit, outboxEvent: outbox };
  }
}

class AuditedOperationError extends Error {
  constructor(readonly operationCause: unknown) {
    super('Audited operation failed.');
  }
}
const auditFilter = (input: AdminAuditLogListInput): Record<string, unknown> => ({
  tenantId: input.tenantId ?? DefaultAuthTenantId,
  ...(input.action ? { action: input.action } : {}),
  ...(input.resource ? { resource: input.resource } : {}),
  ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
  ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
  ...(input.createdFrom || input.createdTo
    ? {
        createdAt: {
          ...(input.createdFrom ? { $gte: input.createdFrom } : {}),
          ...(input.createdTo ? { $lte: input.createdTo } : {}),
        },
      }
    : {}),
});
export const makeAudit = (input: AdminAuditLogInput): AdminAuditLogRecord => ({
  id: randomUUID(),
  tenantId: input.tenantId ?? DefaultAuthTenantId,
  actorUserId: input.actorUserId ?? null,
  action: input.action,
  resource: input.resource,
  targetUserId: input.targetUserId ?? null,
  before: input.before ?? {},
  after: input.after ?? {},
  metadata: input.metadata ?? {},
  createdAt: input.createdAt ?? new Date(),
});
export const makeOutbox = (
  audit: AdminAuditLogRecord,
  aggregateType: string,
  aggregateId: string,
  payload?: Record<string, unknown>,
): TransactionalOutboxRecord => ({
  id: randomUUID(),
  tenantId: audit.tenantId,
  aggregateType,
  aggregateId,
  eventType: audit.action,
  payload: payload ?? {
    auditLogId: audit.id,
    actorUserId: audit.actorUserId,
    resource: audit.resource,
    targetId: audit.targetUserId,
    before: audit.before,
    after: audit.after,
  },
  metadata: audit.metadata,
  status: 'pending',
  createdAt: new Date(),
  publishedAt: null,
});
export const toDocument = <T extends { id: string }>(record: T): MongoAuthDocument => {
  const { id, ...rest } = record;
  return { _id: id, ...rest };
};
const isPowerful = (user: AuthUserPersistenceRecord): boolean =>
  user.status === 'active' &&
  user.permissions.includes('admin:users:write') &&
  user.permissions.includes('admin:users:access-policy:update');
const auditUser = (action: string, user: AuthUserPersistenceRecord): Record<string, unknown> =>
  action === 'admin.user.status.update'
    ? { status: user.status }
    : { status: user.status, roles: user.roles, permissions: user.permissions };
