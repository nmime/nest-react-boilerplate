import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import {
  AdminAuditLogEntity,
  type AuthUserAccessPolicyInput,
  AuthUserEntity,
  DefaultAuthTenantId,
  TransactionalOutboxEventEntity,
} from '../entities';
import type { AuthUserRepositoryError } from './auth-user.repository';
import { adminUserMutationOutboxAggregateType } from './const/admin-user-mutation-internal.const';
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
import {
  countActivePowerfulAdmins as countNormalizedPowerfulAdmins,
  hasActivePowerfulAdminAccess,
} from './util/powerful-admin-access.util';
import {
  reconcileUserDirectPermissions,
  reconcileUserRoles,
  resolveEffectiveAccess,
  resolveInheritedPermissionKeys,
} from './util/reconcile-user-roles.util';

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

  // Assign a user's normalized role set, re-resolve effective access inside the
  // same locked transaction, run self-lockout/last-admin safety checks, and
  // write the audit log plus outbox row atomically.
  mutateUserRolesWithAudit(
    input: AdminUserRoleMutationInput,
  ): ResultAsync<AdminUserMutationResult | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.executeRoleMutation(input), mapAdminUserMutationRepositoryError);
  }

  async countActivePowerfulAdmins(
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): Promise<number> {
    return countNormalizedPowerfulAdmins(entityManager, tenantId);
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
      await this.refreshCanonicalAccess(transactionalEntityManager, beforeEntity, tenantId);
      const before = cloneAuthUser(beforeEntity);
      await this.applyCanonicalAccessPolicy(
        transactionalEntityManager,
        beforeEntity,
        input.policy,
        input.actorUserId,
        tenantId,
      );
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
      await this.refreshCanonicalAccess(transactionalEntityManager, beforeEntity, tenantId);
      const before = cloneAuthUser(beforeEntity);

      // Reconcile the normalized role rows, then re-derive the effective access
      // projection used for safety checks and audit snapshots.
      await reconcileUserRoles(
        transactionalEntityManager,
        tenantId,
        input.targetUserId,
        input.actorUserId,
        input.desiredRoleKeys,
      );
      await this.refreshCanonicalAccess(transactionalEntityManager, beforeEntity, tenantId);
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

  private async applyCanonicalAccessPolicy(
    entityManager: EntityManager,
    entity: AuthUserEntity,
    policy: AuthUserAccessPolicyInput,
    actorUserId: string,
    tenantId: string,
  ): Promise<void> {
    const updatesAccess = policy.roles !== undefined || policy.permissions !== undefined;
    if (!updatesAccess) {
      applyAccessPolicy(entity, policy);
      return;
    }

    const desiredRoleKeys = policy.roles ?? entity.roles;
    await reconcileUserRoles(entityManager, tenantId, entity.id, actorUserId, desiredRoleKeys);

    const inheritedPermissionKeys = await resolveInheritedPermissionKeys(entityManager, tenantId, entity.id);
    const desiredEffectivePermissionKeys = policy.permissions ?? entity.permissions;
    const inherited = new Set(inheritedPermissionKeys);
    await reconcileUserDirectPermissions(
      entityManager,
      tenantId,
      entity.id,
      actorUserId,
      desiredEffectivePermissionKeys.filter((permission) => !inherited.has(permission)),
    );

    await this.refreshCanonicalAccess(entityManager, entity, tenantId, policy.status);
  }

  private async refreshCanonicalAccess(
    entityManager: EntityManager,
    entity: AuthUserEntity,
    tenantId: string,
    status?: AuthUserEntity['status'],
  ): Promise<void> {
    const access = await resolveEffectiveAccess(entityManager, tenantId, entity.id);
    applyAccessPolicy(entity, {
      ...(status ? { status } : {}),
      roles: access.roleKeys,
      permissions: access.permissionKeys,
    });
  }
}
