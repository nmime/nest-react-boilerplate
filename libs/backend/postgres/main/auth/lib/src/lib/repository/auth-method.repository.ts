import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AuthMethodEntity,
  DefaultAuthTenantId,
  type AuthMethodType,
} from "../entity";
import {
  mapSocialAuthError,
  type SocialAuthRepositoryError,
} from "./external-identity.repository";

export interface UpsertAuthMethodInput {
  tenantId?: string;
  userId: string;
  method: AuthMethodType;
  amr?: string[];
  externalIdentityId?: string | null;
  lastUsedAt?: Date | null;
}

@Injectable()
export class AuthMethodRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  upsertMethod(
    input: UpsertAuthMethodInput,
  ): ResultAsync<AuthMethodEntity, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistMethod(input),
      mapSocialAuthError,
    );
  }

  recordLastUsed(
    id: string,
    tenantId: string = DefaultAuthTenantId,
    lastUsedAt: Date = new Date(),
  ): ResultAsync<AuthMethodEntity | null, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.updateLastUsed(id, tenantId, lastUsedAt),
      mapSocialAuthError,
    );
  }

  findByUser(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthMethodEntity[], SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(
        AuthMethodEntity,
        { tenantId, userId },
        { orderBy: { lastUsedAt: "DESC", createdAt: "DESC" } },
      ),
      mapSocialAuthError,
    );
  }

  findLastUsedByUser(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthMethodEntity | null, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(
        AuthMethodEntity,
        { tenantId, userId, lastUsedAt: { $ne: null } },
        { orderBy: { lastUsedAt: "DESC" } },
      ),
      mapSocialAuthError,
    );
  }

  countUsableMethodsForUser(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<number, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.count(AuthMethodEntity, { tenantId, userId }),
      mapSocialAuthError,
    );
  }

  private async persistMethod(
    input: UpsertAuthMethodInput,
  ): Promise<AuthMethodEntity> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const existing = await this.entityManager.findOne(AuthMethodEntity, {
      tenantId,
      userId: input.userId,
      method: input.method,
      externalIdentityId: input.externalIdentityId ?? null,
    });
    const entity = existing ?? new AuthMethodEntity();
    entity.tenantId = tenantId;
    entity.userId = input.userId;
    entity.method = input.method;
    entity.amr = input.amr ?? defaultAmr(input.method);
    entity.externalIdentityId = input.externalIdentityId ?? null;
    entity.lastUsedAt = input.lastUsedAt ?? entity.lastUsedAt;

    if (!existing) {
      this.entityManager.persist(entity);
    }
    await this.entityManager.flush();
    return entity;
  }

  private async updateLastUsed(
    id: string,
    tenantId: string,
    lastUsedAt: Date,
  ): Promise<AuthMethodEntity | null> {
    const entity = await this.entityManager.findOne(AuthMethodEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    entity.lastUsedAt = lastUsedAt;
    await this.entityManager.flush();
    return entity;
  }
}

function defaultAmr(method: AuthMethodType): string[] {
  return method === "password" ? ["pwd"] : [method];
}
