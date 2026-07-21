import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import type { ProblemPresentationDisplay, ProblemPresentationSeverity } from '@app/common-problem-details';
import {
  AdminAuditLogEntity,
  DefaultAuthTenantId,
  ProblemPresentationEntity,
  TransactionalOutboxEventEntity,
} from '../entities';

export interface ProblemPresentationRepositoryError {
  code: 'repository_error' | 'revision_conflict';
  message: string;
}

export interface SaveProblemPresentationInput {
  tenantId?: string;
  ruleId: string;
  display: ProblemPresentationDisplay;
  severity: ProblemPresentationSeverity;
  comment?: string;
  messageEn?: string;
  messageRu?: string;
  expectedRevision: number;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}

export interface ResetProblemPresentationInput {
  tenantId?: string;
  ruleId: string;
  expectedRevision: number;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}

class ProblemPresentationRevisionConflictError extends Error {
  constructor() {
    super('The problem presentation changed after it was loaded. Refresh and try again.');
    this.name = 'ProblemPresentationRevisionConflictError';
  }
}

@Injectable()
export class ProblemPresentationRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  list(
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<ProblemPresentationEntity[], ProblemPresentationRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(ProblemPresentationEntity, { tenantId }, { orderBy: { ruleId: 'ASC' } }),
      mapProblemPresentationRepositoryError,
    );
  }

  save(
    input: SaveProblemPresentationInput,
  ): ResultAsync<ProblemPresentationEntity, ProblemPresentationRepositoryError> {
    return ResultAsync.fromPromise(this.saveWithAudit(input), mapProblemPresentationRepositoryError);
  }

  reset(input: ResetProblemPresentationInput): ResultAsync<boolean, ProblemPresentationRepositoryError> {
    return ResultAsync.fromPromise(this.resetWithAudit(input), mapProblemPresentationRepositoryError);
  }

  private async saveWithAudit(input: SaveProblemPresentationInput): Promise<ProblemPresentationEntity> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;

    return this.entityManager.transactional(async (transactionalEntityManager) => {
      await acquirePresentationLock(transactionalEntityManager, tenantId, input.ruleId);
      const existing = await transactionalEntityManager.findOne(
        ProblemPresentationEntity,
        { tenantId, ruleId: input.ruleId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new ProblemPresentationRevisionConflictError();
      }

      const before = existing ? snapshot(existing) : {};
      const entity =
        existing ??
        new ProblemPresentationEntity({
          tenantId,
          ruleId: input.ruleId,
          display: input.display,
          severity: input.severity,
          comment: input.comment?.trim(),
          messageEn: input.messageEn?.trim(),
          messageRu: input.messageRu?.trim(),
          updatedByUserId: input.actorUserId,
        });

      if (existing) {
        entity.display = input.display;
        entity.severity = input.severity;
        entity.comment = input.comment?.trim() ?? '';
        entity.messageEn = input.messageEn?.trim() ?? '';
        entity.messageRu = input.messageRu?.trim() ?? '';
        entity.revision += 1;
        entity.updatedByUserId = input.actorUserId;
        entity.updatedAt = new Date();
      }

      const auditLog = new AdminAuditLogEntity({
        tenantId,
        actorUserId: input.actorUserId,
        action: 'admin.problem_presentation.update',
        resource: 'admin.settings',
        before,
        after: snapshot(entity),
        metadata: { ruleId: input.ruleId, ...(input.metadata ?? {}) },
      });
      transactionalEntityManager.persist([entity, auditLog, problemPresentationOutbox(auditLog)]);
      await transactionalEntityManager.flush();

      return entity;
    });
  }

  private async resetWithAudit(input: ResetProblemPresentationInput): Promise<boolean> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;

    return this.entityManager.transactional(async (transactionalEntityManager) => {
      await acquirePresentationLock(transactionalEntityManager, tenantId, input.ruleId);
      const existing = await transactionalEntityManager.findOne(
        ProblemPresentationEntity,
        { tenantId, ruleId: input.ruleId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new ProblemPresentationRevisionConflictError();
      }
      if (!existing) {
        return false;
      }

      const auditLog = new AdminAuditLogEntity({
        tenantId,
        actorUserId: input.actorUserId,
        action: 'admin.problem_presentation.reset',
        resource: 'admin.settings',
        before: snapshot(existing),
        after: {},
        metadata: { ruleId: input.ruleId, ...(input.metadata ?? {}) },
      });
      transactionalEntityManager.persist([auditLog, problemPresentationOutbox(auditLog)]);
      transactionalEntityManager.remove(existing);
      await transactionalEntityManager.flush();

      return true;
    });
  }
}

const acquirePresentationLock = async (
  entityManager: EntityManager,
  tenantId: string,
  ruleId: string,
): Promise<void> => {
  await entityManager
    .getConnection()
    .execute('select pg_advisory_xact_lock(hashtext(?))', [`problem-presentation:${tenantId}:${ruleId}`]);
};

const snapshot = (entity: ProblemPresentationEntity): Record<string, unknown> => ({
  ruleId: entity.ruleId,
  display: entity.display,
  severity: entity.severity,
  comment: entity.comment,
  messageEn: entity.messageEn,
  messageRu: entity.messageRu,
  revision: entity.revision,
});

const problemPresentationOutbox = (auditLog: AdminAuditLogEntity): TransactionalOutboxEventEntity =>
  new TransactionalOutboxEventEntity({
    tenantId: auditLog.tenantId,
    aggregateType: 'problem-presentation',
    aggregateId: auditLog.id,
    eventType: auditLog.action,
    payload: { auditLogId: auditLog.id, before: auditLog.before, after: auditLog.after },
    metadata: auditLog.metadata,
  });

const mapProblemPresentationRepositoryError = (cause: unknown): ProblemPresentationRepositoryError =>
  cause instanceof ProblemPresentationRevisionConflictError
    ? { code: 'revision_conflict', message: cause.message }
    : {
        code: 'repository_error',
        message: cause instanceof Error ? cause.message : 'Problem presentation repository failed.',
      };
