import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import { AdminAuditLogEntity, AuthUserEntity, DefaultAuthTenantId, TransactionalOutboxEventEntity } from '../entities';
import type { AuthUserRepositoryError } from './auth-user.repository';
import { adminUserMutationOutboxAggregateType } from './const/admin-user-mutation-internal.const';
import {
  AdminRoleName,
  AdminUsersAccessPolicyUpdatePermissionName,
  AdminUsersWritePermissionName,
} from './const/admin-user-mutation.const';
import { AdminUserMutationSafetyError } from './exception/admin-user-mutation-safety.exception';
import { cloneAuthUser } from './factory/clone-auth-user.factory';
import { mapAdminUserMutationRepositoryError } from './mapper/admin-user-mutation-error.mapper';
import { auditSnapshotFor } from './mapper/audit-snapshot.mapper';
import type {
  AdminSensitiveMutationSafety,
  AdminUserMutationAction,
  AdminUserMutationInput,
  AdminUserMutationResult,
  AdminUserMutationSafetyViolation,
  AdminUserRoleMutationInput,
} from './type/admin-user-mutation.type';
import { applyAccessPolicy } from './util/access-policy.util';
import { hasActivePowerfulAdminAccess } from './util/powerful-admin-access.util';
import { reconcileUserRoles, resolveEffectiveAccess } from './util/reconcile-user-roles.util';

export * from './const/admin-user-mutation.const';
export * from './exception/admin-user-mutation-safety.exception';
export * from './type/admin-user-mutation.type';
export * from './util/pagination.util';
export * from './util/powerful-admin-access.util';

@Injectable()
export class AdminUserMutationRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  mutateAccessPolicyWithAudit(
    input: AdminUserMutationInput,
  ): ResultAsync<AdminUserMutationResult | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.executeSensitiveMutation(input), mapAdminUserMutationRepositoryError);
  }

  // Assign a user's normalized role set (auth_user_roles), re-resolve the
  // effective access from the normalized RBAC join, and refresh the denormalized
  // auth_users.roles/permissions jsonb cache — all inside the single locked
  // transaction that also runs the self-lockout / last-powerful-admin safety
  // checks and writes the audit log + outbox row. Folding the jsonb refresh into
  // this transaction (instead of calling the non-transactional
  // EffectivePermissionService afterwards) keeps the normalized assignment and
  // the cache atomic: a safety violation rolls both back together.
  mutateUserRolesWithAudit(
    input: AdminUserRoleMutationInput,
  ): ResultAsync<AdminUserMutationResult | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.executeRoleMutation(input), mapAdminUserMutationRepositoryError);
  }

  async countActivePowerfulAdmins(
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): Promise<number> {
    return entityManager.count(AuthUserEntity, {
      tenantId,
      status: 'active',
      roles: { $contains: [AdminRoleName] },
      permissions: {
        $contains: [AdminUsersWritePermissionName, AdminUsersAccessPolicyUpdatePermissionName],
      },
    });
  }

  async acquireTenantMutationLock(tenantId: string, entityManager: EntityManager = this.entityManager): Promise<void> {
    await entityManager
      .getConnection()
      .execute('select pg_advisory_xact_lock(hashtext(?))', [`admin-user-sensitive-mutation:${tenantId}`]);
  }

  assertSensitiveMutationIsSafe(
    input: AdminSensitiveMutationSafety & { activePowerfulAdminCount: number },
  ): AdminUserMutationSafetyViolation | null {
    const isSelf = input.actorUserId === input.targetBefore.id;
    const wasActivePowerfulAdmin = hasActivePowerfulAdminAccess(input.targetBefore);
    const remainsActivePowerfulAdmin = hasActivePowerfulAdminAccess(input.targetAfter);
    const removesActivePowerfulAdmin = wasActivePowerfulAdmin && !remainsActivePowerfulAdmin;

    if (isSelf && removesActivePowerfulAdmin) {
      return {
        code: 'self_lockout',
        message: 'Administrators cannot remove their own active admin write access.',
      };
    }

    if (removesActivePowerfulAdmin && input.activePowerfulAdminCount <= 1) {
      return {
        code: 'last_powerful_admin',
        message: 'At least one active administrator must retain admin write access.',
      };
    }

    return null;
  }

  private async executeSensitiveMutation(input: AdminUserMutationInput): Promise<AdminUserMutationResult | null> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;

    return this.entityManager.transactional(async (transactionalEntityManager) => {
      await this.acquireTenantMutationLock(tenantId, transactionalEntityManager);

      const beforeEntity = await transactionalEntityManager.findOne(
        AuthUserEntity,
        { id: input.targetUserId, tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!beforeEntity) {
        return null;
      }

      const activePowerfulAdminCount = await this.countActivePowerfulAdmins(tenantId, transactionalEntityManager);
      const before = cloneAuthUser(beforeEntity);
      applyAccessPolicy(beforeEntity, input.policy);
      const after = cloneAuthUser(beforeEntity);
      const violation = this.assertSensitiveMutationIsSafe({
        actorUserId: input.actorUserId,
        tenantId,
        targetBefore: before,
        targetAfter: after,
        activePowerfulAdminCount,
      });
      if (violation) {
        throw new AdminUserMutationSafetyError(violation);
      }

      const auditLog = new AdminAuditLogEntity({
        tenantId,
        actorUserId: input.audit.actorUserId ?? input.actorUserId,
        action: input.action,
        resource: 'admin.users',
        targetUserId: input.targetUserId,
        before: auditSnapshotFor(input.action, before),
        after: auditSnapshotFor(input.action, after),
        metadata: input.audit.metadata ?? {},
      });
      const outboxEvent = new TransactionalOutboxEventEntity({
        tenantId,
        aggregateType: adminUserMutationOutboxAggregateType,
        aggregateId: input.targetUserId,
        eventType: input.action,
        payload: {
          auditLogId: auditLog.id,
          targetUserId: input.targetUserId,
          actorUserId: input.actorUserId,
          before: auditLog.before,
          after: auditLog.after,
        },
        metadata: input.audit.metadata ?? {},
      });

      transactionalEntityManager.persist([auditLog, outboxEvent]);
      await transactionalEntityManager.flush();

      return {
        before,
        after,
        auditLog,
        outboxEvent,
      };
    });
  }

  private async executeRoleMutation(input: AdminUserRoleMutationInput): Promise<AdminUserMutationResult | null> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;

    return this.entityManager.transactional(async (transactionalEntityManager) => {
      await this.acquireTenantMutationLock(tenantId, transactionalEntityManager);

      const beforeEntity = await transactionalEntityManager.findOne(
        AuthUserEntity,
        { id: input.targetUserId, tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!beforeEntity) {
        return null;
      }

      const activePowerfulAdminCount = await this.countActivePowerfulAdmins(tenantId, transactionalEntityManager);
      const before = cloneAuthUser(beforeEntity);

      // Reconcile the normalized auth_user_roles rows to exactly the desired
      // role keys that resolve to a seeded role, then re-derive the effective
      // access from the normalized join so the jsonb cache mirrors the DB.
      await reconcileUserRoles(
        transactionalEntityManager,
        tenantId,
        input.targetUserId,
        input.actorUserId,
        input.desiredRoleKeys,
      );
      const access = await resolveEffectiveAccess(transactionalEntityManager, tenantId, input.targetUserId);
      applyAccessPolicy(beforeEntity, {
        roles: access.roleKeys,
        permissions: access.permissionKeys,
      });
      const after = cloneAuthUser(beforeEntity);

      const violation = this.assertSensitiveMutationIsSafe({
        actorUserId: input.actorUserId,
        tenantId,
        targetBefore: before,
        targetAfter: after,
        activePowerfulAdminCount,
      });
      if (violation) {
        throw new AdminUserMutationSafetyError(violation);
      }

      const action: AdminUserMutationAction = 'admin.user.roles.update';
      const auditLog = new AdminAuditLogEntity({
        tenantId,
        actorUserId: input.audit.actorUserId ?? input.actorUserId,
        action,
        resource: 'admin.users',
        targetUserId: input.targetUserId,
        before: auditSnapshotFor(action, before),
        after: auditSnapshotFor(action, after),
        metadata: input.audit.metadata ?? {},
      });
      const outboxEvent = new TransactionalOutboxEventEntity({
        tenantId,
        aggregateType: adminUserMutationOutboxAggregateType,
        aggregateId: input.targetUserId,
        eventType: action,
        payload: {
          auditLogId: auditLog.id,
          targetUserId: input.targetUserId,
          actorUserId: input.actorUserId,
          before: auditLog.before,
          after: auditLog.after,
        },
        metadata: input.audit.metadata ?? {},
      });

      transactionalEntityManager.persist([auditLog, outboxEvent]);
      await transactionalEntityManager.flush();

      return {
        before,
        after,
        auditLog,
        outboxEvent,
      };
    });
  }
}
