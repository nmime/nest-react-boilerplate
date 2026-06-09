import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AdminAuditLogEntity,
  DefaultAuthTenantId,
  type AdminAuditLogEntityInput,
} from "../entity";
import {
  normalizePageLimit,
  normalizePageOffset,
} from "./admin-user-mutation.repository";
import type { AuthUserRepositoryError } from "./auth-user.repository";

export interface AdminAuditLogListInput {
  tenantId?: string;
  action?: string;
  actorUserId?: string;
  targetUserId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AdminAuditLogRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  record(
    input: AdminAuditLogEntityInput,
  ): ResultAsync<AdminAuditLogEntity, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.persist(input), mapRepositoryError);
  }

  list(
    input: AdminAuditLogListInput = {},
  ): ResultAsync<AdminAuditLogEntity[], AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(AdminAuditLogEntity, toAuditFilter(input), {
        limit: normalizePageLimit(input.limit),
        offset: normalizePageOffset(input.offset),
        orderBy: { createdAt: "DESC", id: "DESC" },
      }),
      mapRepositoryError,
    );
  }

  count(
    input: AdminAuditLogListInput = {},
  ): ResultAsync<number, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.count(AdminAuditLogEntity, toAuditFilter(input)),
      mapRepositoryError,
    );
  }

  private async persist(
    input: AdminAuditLogEntityInput,
  ): Promise<AdminAuditLogEntity> {
    const entity = new AdminAuditLogEntity(input);
    this.entityManager.persist(entity);
    await this.entityManager.flush();

    return entity;
  }
}

function toAuditFilter(input: AdminAuditLogListInput): object {
  return {
    tenantId: input.tenantId ?? DefaultAuthTenantId,
    ...(input.action ? { action: input.action } : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
  };
}

function mapRepositoryError(cause: unknown): AuthUserRepositoryError {
  return {
    code: "repository_error",
    message:
      cause instanceof Error ? cause.message : "Admin audit repository failed.",
  };
}
