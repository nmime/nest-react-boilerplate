import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import {
  AdminAuditLogEntity,
  DefaultAuthTenantId,
  TransactionalOutboxEventEntity,
  type AdminAuditLogEntityInput,
} from '../entities';
import { normalizePageLimit, normalizePageOffset } from './admin-user-mutation.repository';
import type { AuthUserRepositoryError } from './auth-user.repository';

export interface AdminAuditLogListInput {
  tenantId?: string;
  action?: string;
  resource?: string;
  actorUserId?: string;
  targetUserId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
  offset?: number;
}

export interface AdminAuditLogTransactionalRecordInput<T> {
  // The operation receives the exact transactional EntityManager used for the
  // audit row and outbox event. Callers that mutate auth-owned data must pass
  // that manager through to their repository so the change and its evidence
  // commit or roll back together.
  operation: (entityManager: EntityManager) => Promise<T>;
  audit: (result: T) => AdminAuditLogEntityInput;
}

export class AdminAuditLogTransactionError extends Error {
  constructor(cause: unknown) {
    super('Admin audit transaction failed.', { cause });
    this.name = 'AdminAuditLogTransactionError';
  }
}

class AdminAuditedOperationError extends Error {
  constructor(readonly operationCause: unknown) {
    super('Audited operation failed.', { cause: operationCause });
    this.name = 'AdminAuditedOperationError';
  }
}

@Injectable()
export class AdminAuditLogRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  record(input: AdminAuditLogEntityInput): ResultAsync<AdminAuditLogEntity, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.persist(input), mapRepositoryError);
  }

  async recordTransactionally<T>(input: AdminAuditLogTransactionalRecordInput<T>): Promise<T> {
    try {
      return await this.entityManager.transactional(async (transactionalEntityManager) => {
        let result: T;
        try {
          result = await input.operation(transactionalEntityManager);
        } catch (cause) {
          throw new AdminAuditedOperationError(cause);
        }
        const auditLog = new AdminAuditLogEntity(input.audit(result));
        transactionalEntityManager.persist([auditLog, toOutboxEvent(auditLog)]);
        await transactionalEntityManager.flush();
        return result;
      });
    } catch (cause) {
      if (cause instanceof AdminAuditedOperationError) {
        throw cause.operationCause;
      }
      throw new AdminAuditLogTransactionError(cause);
    }
  }

  list(input: AdminAuditLogListInput = {}): ResultAsync<AdminAuditLogEntity[], AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(AdminAuditLogEntity, toAuditFilter(input), {
        limit: normalizePageLimit(input.limit),
        offset: normalizePageOffset(input.offset),
        orderBy: { createdAt: 'DESC', id: 'DESC' },
      }),
      mapRepositoryError,
    );
  }

  count(input: AdminAuditLogListInput = {}): ResultAsync<number, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.count(AdminAuditLogEntity, toAuditFilter(input)),
      mapRepositoryError,
    );
  }

  findById(
    id: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AdminAuditLogEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AdminAuditLogEntity, { id, tenantId }),
      mapRepositoryError,
    );
  }

  private async persist(input: AdminAuditLogEntityInput): Promise<AdminAuditLogEntity> {
    return this.entityManager.transactional(async (em) => {
      const entity = new AdminAuditLogEntity(input);
      em.persist([entity, toOutboxEvent(entity)]);
      await em.flush();
      return entity;
    });
  }
}

const toOutboxEvent = (auditLog: AdminAuditLogEntity): TransactionalOutboxEventEntity =>
  new TransactionalOutboxEventEntity({
    tenantId: auditLog.tenantId,
    aggregateType: 'admin-audit-log',
    aggregateId: auditLog.targetUserId ?? auditLog.id,
    eventType: auditLog.action,
    payload: {
      auditLogId: auditLog.id,
      actorUserId: auditLog.actorUserId,
      resource: auditLog.resource,
      targetId: auditLog.targetUserId,
      before: auditLog.before,
      after: auditLog.after,
    },
    metadata: auditLog.metadata,
  });

function toAuditFilter(input: AdminAuditLogListInput): Record<string, unknown> {
  return {
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
  };
}

function mapRepositoryError(cause: unknown): AuthUserRepositoryError {
  return {
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Admin audit repository failed.',
  };
}
