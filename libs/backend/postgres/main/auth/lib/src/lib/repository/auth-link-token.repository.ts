import { EntityManager, LockMode } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AuthLinkTokenEntity,
  DefaultAuthTenantId,
  type AuthLinkTokenPurpose,
  type ExternalAuthProvider,
} from "../entity";
import {
  mapSocialAuthError,
  type SocialAuthRepositoryError,
} from "./external-identity.repository";

export interface CreateAuthLinkTokenInput {
  id?: string;
  tenantId?: string;
  userId?: string | null;
  provider: ExternalAuthProvider;
  purpose: AuthLinkTokenPurpose;
  tokenHash: string;
  nonce?: string | null;
  deepLinkMetadata?: Record<string, unknown>;
  expiresAt: Date;
}

@Injectable()
export class AuthLinkTokenRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  createToken(
    input: CreateAuthLinkTokenInput,
  ): ResultAsync<AuthLinkTokenEntity, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistToken(input),
      mapSocialAuthError,
    );
  }

  consumeToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId: string = DefaultAuthTenantId,
    now: Date = new Date(),
  ): ResultAsync<AuthLinkTokenEntity | null, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.consumeTokenTransaction(tokenHash, purpose, tenantId, now),
      mapSocialAuthError,
    );
  }

  revokeToken(
    tokenHash: string,
    tenantId: string = DefaultAuthTenantId,
    now: Date = new Date(),
  ): ResultAsync<boolean, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.revokeTokenTransaction(tokenHash, tenantId, now),
      mapSocialAuthError,
    );
  }

  private async persistToken(
    input: CreateAuthLinkTokenInput,
  ): Promise<AuthLinkTokenEntity> {
    const entity = new AuthLinkTokenEntity();
    if (input.id) {
      entity.id = input.id;
    }
    entity.tenantId = input.tenantId ?? DefaultAuthTenantId;
    entity.userId = input.userId ?? null;
    entity.provider = input.provider;
    entity.purpose = input.purpose;
    entity.tokenHash = input.tokenHash;
    entity.nonce = input.nonce?.trim() || null;
    entity.deepLinkMetadata = input.deepLinkMetadata ?? {};
    entity.expiresAt = input.expiresAt;

    this.entityManager.persist(entity);
    await this.entityManager.flush();
    return entity;
  }

  private async consumeTokenTransaction(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId: string,
    now: Date,
  ): Promise<AuthLinkTokenEntity | null> {
    return this.entityManager.transactional(async (em) => {
      const current = await em.findOne(
        AuthLinkTokenEntity,
        {
          tokenHash,
          purpose,
          tenantId,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { $gt: now },
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!current) {
        return null;
      }

      current.consumedAt = now;
      await em.flush();
      return current;
    });
  }

  private async revokeTokenTransaction(
    tokenHash: string,
    tenantId: string,
    now: Date,
  ): Promise<boolean> {
    return this.entityManager.transactional(async (em) => {
      const current = await em.findOne(
        AuthLinkTokenEntity,
        {
          tokenHash,
          tenantId,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { $gt: now },
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!current) {
        return false;
      }

      current.revokedAt = now;
      await em.flush();
      return true;
    });
  }
}
