import { EntityManager, LockMode } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AuthRefreshTokenEntity,
  AuthUserTokenEntity,
  DefaultAuthTenantId,
  type AuthUserTokenPurpose,
} from "../entities";
import { mapAuthTokenRepositoryError } from "./mapper/auth-token-error.mapper";
import type {
  AuthTokenCleanupResult,
  AuthTokenRepositoryError,
  PersistAuthRefreshTokenInput,
  PersistAuthUserTokenInput,
  RotateAuthRefreshTokenInput,
} from "./type/auth-token.type";

export * from "./type/auth-token.type";

@Injectable()
export class AuthTokenRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  createRefreshToken(
    input: PersistAuthRefreshTokenInput,
  ): ResultAsync<AuthRefreshTokenEntity, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistRefreshToken(input),
      mapAuthTokenRepositoryError,
    );
  }

  findUsableRefreshToken(
    tokenHash: string,
    tenantId: string = DefaultAuthTenantId,
    now: Date = new Date(),
  ): ResultAsync<AuthRefreshTokenEntity | null, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthRefreshTokenEntity, {
        tokenHash,
        tenantId,
        revokedAt: null,
        expiresAt: { $gt: now },
      }),
      mapAuthTokenRepositoryError,
    );
  }

  rotateRefreshToken(
    input: RotateAuthRefreshTokenInput,
  ): ResultAsync<AuthRefreshTokenEntity | null, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.rotateRefreshTokenTransaction(input),
      mapAuthTokenRepositoryError,
    );
  }

  revokeRefreshToken(
    tokenHash: string,
    tenantId: string = DefaultAuthTenantId,
    now: Date = new Date(),
  ): ResultAsync<boolean, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.revokeRefreshTokenTransaction(tokenHash, tenantId, now),
      mapAuthTokenRepositoryError,
    );
  }

  createUserToken(
    input: PersistAuthUserTokenInput,
  ): ResultAsync<AuthUserTokenEntity, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistUserToken(input),
      mapAuthTokenRepositoryError,
    );
  }

  consumeUserToken(
    tokenHash: string,
    purpose: AuthUserTokenPurpose,
    tenantId: string = DefaultAuthTenantId,
    now: Date = new Date(),
  ): ResultAsync<AuthUserTokenEntity | null, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.consumeUserTokenTransaction(tokenHash, purpose, tenantId, now),
      mapAuthTokenRepositoryError,
    );
  }

  cleanupExpiredTokens(
    before: Date = new Date(),
  ): ResultAsync<AuthTokenCleanupResult, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(
      this.deleteExpiredTokens(before),
      mapAuthTokenRepositoryError,
    );
  }

  private async persistRefreshToken(
    input: PersistAuthRefreshTokenInput,
  ): Promise<AuthRefreshTokenEntity> {
    const entity = new AuthRefreshTokenEntity();
    entity.id = input.id;
    entity.tenantId = input.tenantId ?? DefaultAuthTenantId;
    entity.userId = input.userId;
    entity.tokenHash = input.tokenHash;
    entity.familyId = input.familyId;
    entity.parentTokenId = input.parentTokenId ?? null;
    entity.expiresAt = input.expiresAt;

    this.entityManager.persist(entity);
    await this.entityManager.flush();
    return entity;
  }

  private async rotateRefreshTokenTransaction(
    input: RotateAuthRefreshTokenInput,
  ): Promise<AuthRefreshTokenEntity | null> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const now = input.now ?? new Date();

    return this.entityManager.transactional(async (em) => {
      const current = await em.findOne(
        AuthRefreshTokenEntity,
        {
          tokenHash: input.tokenHash,
          tenantId,
          revokedAt: null,
          expiresAt: { $gt: now },
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!current) {
        await this.revokeReusedTokenFamily(em, input.tokenHash, tenantId, now);
        return null;
      }

      const replacement = new AuthRefreshTokenEntity();
      replacement.id = input.replacement.id;
      replacement.tenantId = current.tenantId;
      replacement.userId = current.userId;
      replacement.tokenHash = input.replacement.tokenHash;
      replacement.familyId = current.familyId;
      replacement.parentTokenId = current.id;
      replacement.expiresAt = input.replacement.expiresAt;

      current.revokedAt = now;
      current.replacedByTokenId = replacement.id;
      em.persist(replacement);
      await em.flush();
      return replacement;
    });
  }

  private async revokeReusedTokenFamily(
    em: EntityManager,
    tokenHash: string,
    tenantId: string,
    now: Date,
  ): Promise<void> {
    const replayed = await em.findOne(AuthRefreshTokenEntity, {
      tokenHash,
      tenantId,
    });
    // Reuse detection: a token that still exists but was already revoked/rotated
    // signals replay of a stolen refresh token. Revoke the entire family so the
    // active (rotated) descendant token can no longer be used.
    if (!replayed?.revokedAt) {
      return;
    }
    await em.nativeUpdate(
      AuthRefreshTokenEntity,
      { familyId: replayed.familyId, tenantId, revokedAt: null },
      { revokedAt: now },
    );
  }

  private async revokeRefreshTokenTransaction(
    tokenHash: string,
    tenantId: string,
    now: Date,
  ): Promise<boolean> {
    return this.entityManager.transactional(async (em) => {
      const current = await em.findOne(
        AuthRefreshTokenEntity,
        {
          tokenHash,
          tenantId,
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

  private async persistUserToken(
    input: PersistAuthUserTokenInput,
  ): Promise<AuthUserTokenEntity> {
    const entity = new AuthUserTokenEntity();
    entity.id = input.id;
    entity.tenantId = input.tenantId ?? DefaultAuthTenantId;
    entity.userId = input.userId;
    entity.purpose = input.purpose;
    entity.tokenHash = input.tokenHash;
    entity.expiresAt = input.expiresAt;

    this.entityManager.persist(entity);
    await this.entityManager.flush();
    return entity;
  }

  private async consumeUserTokenTransaction(
    tokenHash: string,
    purpose: AuthUserTokenPurpose,
    tenantId: string,
    now: Date,
  ): Promise<AuthUserTokenEntity | null> {
    return this.entityManager.transactional(async (em) => {
      const current = await em.findOne(
        AuthUserTokenEntity,
        {
          tokenHash,
          purpose,
          tenantId,
          consumedAt: null,
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

  private async deleteExpiredTokens(
    before: Date,
  ): Promise<AuthTokenCleanupResult> {
    const refreshTokensDeleted = await this.entityManager.nativeDelete(
      AuthRefreshTokenEntity,
      { expiresAt: { $lte: before } },
    );
    const userTokensDeleted = await this.entityManager.nativeDelete(
      AuthUserTokenEntity,
      { expiresAt: { $lte: before } },
    );

    return { refreshTokensDeleted, userTokensDeleted };
  }
}
