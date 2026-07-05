import type {
  AdminAuditLogEntity,
  AuthUserAccessPolicyInput,
  AuthUserEntity,
  TransactionalOutboxEventEntity,
} from "../../entities";

export type AdminUserMutationAction =
  | "admin.user.status.update"
  | "admin.user.access_policy.update"
  | "admin.user.roles.update";

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

export interface AdminUserRoleMutationInput {
  tenantId?: string;
  targetUserId: string;
  actorUserId: string;
  desiredRoleKeys: readonly string[];
  audit: AdminUserMutationAuditInput;
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
