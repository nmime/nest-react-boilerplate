import { EntityManager, LockMode } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AdminAuditLogEntity,
  AuthUserEntity,
  DefaultAuthTenantId,
  TransactionalOutboxEventEntity,
  type AdminAuditLogEntityInput,
  type AuthUserAccessPolicyInput,
} from "../entities";
import type { AuthUserRepositoryError } from "./auth-user.repository";

export type AdminUserMutationAction =
  "admin.user.status.update" | "admin.user.access_policy.update";

export interface AdminUserMutationAuditInput {
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminUserMutationInput {
  tenantId?: string;
  targetUserId: string;
  actorUserId: string;
  policy: AuthUserAccessPolicyInput;
  audit: AdminUserMutationAuditInput;
  action: AdminUserMutationAction;
}

export interface AdminUserMutationResult {
  before: AuthUserEntity;
  after: AuthUserEntity;
  auditLog: AdminAuditLogEntity;
  outboxEvent: TransactionalOutboxEventEntity;
}

export interface AdminSensitiveMutationSafety {
  actorUserId: string;
  tenantId: string;
  targetBefore: AuthUserEntity;
  targetAfter: AuthUserEntity;
}

export interface AdminUserMutationSafetyViolation {
  code: "self_lockout" | "last_powerful_admin";
  message: string;
}

export const AdminUserMutationRepositoryError = "repository_error";
export const AdminRoleName = "admin";
export const AdminUsersWritePermissionName = "admin:users:write";
export const AdminUsersAccessPolicyUpdatePermissionName =
  "admin:users:access-policy:update";
const adminUserMutationOutboxAggregateType = "admin.user";
const maxPageSize = 100;

@Injectable()
export class AdminUserMutationRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  mutateAccessPolicyWithAudit(
    input: AdminUserMutationInput,
  ): ResultAsync<AdminUserMutationResult | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.executeSensitiveMutation(input),
      mapRepositoryError,
    );
  }

  async countActivePowerfulAdmins(
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): Promise<number> {
    return entityManager.count(AuthUserEntity, {
      tenantId,
      status: "active",
      roles: { $contains: [AdminRoleName] },
      permissions: {
        $contains: [
          AdminUsersWritePermissionName,
          AdminUsersAccessPolicyUpdatePermissionName,
        ],
      },
    });
  }

  async acquireTenantMutationLock(
    tenantId: string,
    entityManager: EntityManager = this.entityManager,
  ): Promise<void> {
    await entityManager
      .getConnection()
      .execute("select pg_advisory_xact_lock(hashtext(?))", [
        `admin-user-sensitive-mutation:${tenantId}`,
      ]);
  }

  assertSensitiveMutationIsSafe(
    input: AdminSensitiveMutationSafety & { activePowerfulAdminCount: number },
  ): AdminUserMutationSafetyViolation | null {
    const isSelf = input.actorUserId === input.targetBefore.id;
    const wasActivePowerfulAdmin = hasActivePowerfulAdminAccess(
      input.targetBefore,
    );
    const remainsActivePowerfulAdmin = hasActivePowerfulAdminAccess(
      input.targetAfter,
    );
    const removesActivePowerfulAdmin =
      wasActivePowerfulAdmin && !remainsActivePowerfulAdmin;

    if (isSelf && removesActivePowerfulAdmin) {
      return {
        code: "self_lockout",
        message:
          "Administrators cannot remove their own active admin write access.",
      };
    }

    if (removesActivePowerfulAdmin && input.activePowerfulAdminCount <= 1) {
      return {
        code: "last_powerful_admin",
        message:
          "At least one active administrator must retain admin write access.",
      };
    }

    return null;
  }

  private async executeSensitiveMutation(
    input: AdminUserMutationInput,
  ): Promise<AdminUserMutationResult | null> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;

    return this.entityManager.transactional(
      async (transactionalEntityManager) => {
        await this.acquireTenantMutationLock(
          tenantId,
          transactionalEntityManager,
        );

        const beforeEntity = await transactionalEntityManager.findOne(
          AuthUserEntity,
          { id: input.targetUserId, tenantId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!beforeEntity) {
          return null;
        }

        const activePowerfulAdminCount = await this.countActivePowerfulAdmins(
          tenantId,
          transactionalEntityManager,
        );
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
          resource: "admin.users",
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
      },
    );
  }
}

export class AdminUserMutationSafetyError extends Error {
  constructor(readonly violation: AdminUserMutationSafetyViolation) {
    super(violation.message);
    this.name = "AdminUserMutationSafetyError";
  }
}

export function normalizePageLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(value ?? 50), 1), maxPageSize);
}

export function normalizePageOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(Math.trunc(value ?? 0), 0);
}

export function hasActivePowerfulAdminAccess(
  entity: Pick<AuthUserEntity, "status" | "roles" | "permissions">,
): boolean {
  return (
    entity.status === "active" &&
    entity.roles.includes(AdminRoleName) &&
    entity.permissions.includes(AdminUsersWritePermissionName) &&
    entity.permissions.includes(AdminUsersAccessPolicyUpdatePermissionName)
  );
}

function applyAccessPolicy(
  entity: AuthUserEntity,
  policy: AuthUserAccessPolicyInput,
): void {
  if (policy.status) {
    entity.status = policy.status;
  }
  if (policy.roles) {
    entity.roles = [...policy.roles];
  }
  if (policy.permissions) {
    entity.permissions = [...policy.permissions];
  }
}

function auditSnapshotFor(
  action: AdminUserMutationAction,
  entity: AuthUserEntity,
): AdminAuditLogEntityInput["before"] {
  if (action === "admin.user.status.update") {
    return { status: entity.status };
  }

  return {
    roles: [...entity.roles],
    permissions: [...entity.permissions],
    status: entity.status,
  };
}

function cloneAuthUser(entity: AuthUserEntity): AuthUserEntity {
  const clone = new AuthUserEntity({
    tenantId: entity.tenantId,
    email: entity.email,
    displayName: entity.displayName,
    passwordHash: entity.passwordHash,
    status: entity.status,
    roles: [...entity.roles],
    permissions: [...entity.permissions],
    locale: entity.locale,
    theme: entity.theme,
    lastLoginAt: entity.lastLoginAt,
  });
  clone.id = entity.id;
  clone.createdAt = entity.createdAt;
  clone.updatedAt = entity.updatedAt;

  return clone;
}

function mapRepositoryError(cause: unknown): AuthUserRepositoryError {
  if (cause instanceof AdminUserMutationSafetyError) {
    return {
      code: AdminUserMutationRepositoryError,
      message: cause.message,
    };
  }

  return {
    code: AdminUserMutationRepositoryError,
    message:
      cause instanceof Error
        ? cause.message
        : "Admin user mutation repository failed.",
  };
}
