import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import { AuthUserTokenEntity, DefaultAuthTenantId, type AuthUserTokenPurpose } from '../entities';
import { mapAuthTokenRepositoryError } from './mapper/auth-token-error.mapper';
import type {
  AuthTokenCleanupResult,
  AuthTokenRepositoryError,
  PersistAuthUserTokenInput,
} from './type/auth-token.type';

export * from './type/auth-token.type';

@Injectable()
export class AuthTokenRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  createUserToken(input: PersistAuthUserTokenInput): ResultAsync<AuthUserTokenEntity, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(this.persistUserToken(input), mapAuthTokenRepositoryError);
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

  cleanupExpiredTokens(before: Date = new Date()): ResultAsync<AuthTokenCleanupResult, AuthTokenRepositoryError> {
    return ResultAsync.fromPromise(this.deleteExpiredTokens(before), mapAuthTokenRepositoryError);
  }

  private async persistUserToken(input: PersistAuthUserTokenInput): Promise<AuthUserTokenEntity> {
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

  private async deleteExpiredTokens(before: Date): Promise<AuthTokenCleanupResult> {
    const userTokensDeleted = await this.entityManager.nativeDelete(AuthUserTokenEntity, {
      expiresAt: { $lte: before },
    });

    return { userTokensDeleted };
  }
}
