import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import {
  AuthTokenRepository,
  type AuthRefreshTokenEntity,
  type AuthUserTokenEntity,
} from '@app/backend-postgres-main-auth';
import type {
  AuthTokenStore,
  AuthTokenStoreError,
  AuthUserTokenPurpose,
  IssuedRefreshToken,
  IssuedUserActionToken,
  RefreshTokenIssueInput,
  RefreshTokenRecord,
  UserActionTokenIssueInput,
  UserActionTokenRecord,
} from './type/auth-token-store.type';
import { DefaultRefreshTokenTtlSeconds } from './const/auth-token-store-ttl.const';
import { createOpaqueToken, hashOpaqueToken } from './factory/auth-token-crypto.factory';
import { createIssuedRefreshToken, createIssuedUserActionToken } from './factory/auth-token.factory';
import {
  mapTokenStoreError,
  secondsFromNow,
  toRefreshTokenAuthContext,
  toRefreshTokenRecord,
  toUserActionTokenRecord,
} from './util/auth-token-store.util';

/* v8 ignore start -- Nest decorator metadata is framework glue, not runtime branch logic. */
@Injectable()
export class PostgresAuthTokenStore implements AuthTokenStore {
  constructor(private readonly repository: AuthTokenRepository) {}
  /* v8 ignore stop */

  issueRefreshToken(input: RefreshTokenIssueInput): ResultAsync<IssuedRefreshToken, AuthTokenStoreError> {
    const issued = createIssuedRefreshToken(input);
    return this.repository
      .createRefreshToken({
        id: issued.id,
        tenantId: issued.tenantId,
        userId: issued.userId,
        tokenHash: issued.tokenHash,
        familyId: issued.familyId,
        parentTokenId: input.parentTokenId ?? null,
        expiresAt: issued.expiresAt,
        authContext: issued.authContext ?? null,
      })
      .map(() => issued)
      .mapErr(mapTokenStoreError);
  }

  rotateRefreshToken(
    token: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<IssuedRefreshToken | null, AuthTokenStoreError> {
    const nextToken = createOpaqueToken();
    const nextTokenHash = hashOpaqueToken(nextToken);
    const nextId = randomUUID();
    const nextExpiresAt = secondsFromNow(DefaultRefreshTokenTtlSeconds);

    return this.repository
      .rotateRefreshToken({
        tokenHash: hashOpaqueToken(token),
        tenantId,
        replacement: {
          id: nextId,
          tokenHash: nextTokenHash,
          expiresAt: nextExpiresAt,
        },
      })
      .map((entity: AuthRefreshTokenEntity | null) =>
        entity
          ? {
              id: entity.id,
              tenantId: entity.tenantId,
              userId: entity.userId,
              token: nextToken,
              tokenHash: entity.tokenHash,
              familyId: entity.familyId,
              expiresAt: entity.expiresAt,
              authContext: toRefreshTokenAuthContext(entity.authContext),
            }
          : null,
      )
      .mapErr(mapTokenStoreError);
  }

  revokeRefreshToken(token: string, tenantId: string = DefaultAuthTenantId): ResultAsync<boolean, AuthTokenStoreError> {
    return this.repository.revokeRefreshToken(hashOpaqueToken(token), tenantId).mapErr(mapTokenStoreError);
  }

  findRefreshToken(
    token: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<RefreshTokenRecord | null, AuthTokenStoreError> {
    return this.repository
      .findUsableRefreshToken(hashOpaqueToken(token), tenantId)
      .map((entity: AuthRefreshTokenEntity | null) => (entity ? toRefreshTokenRecord(entity) : null))
      .mapErr(mapTokenStoreError);
  }

  issueUserActionToken(input: UserActionTokenIssueInput): ResultAsync<IssuedUserActionToken, AuthTokenStoreError> {
    const issued = createIssuedUserActionToken(input);
    return this.repository
      .createUserToken({
        id: issued.id,
        tenantId: issued.tenantId,
        userId: issued.userId,
        purpose: issued.purpose,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      })
      .map(() => issued)
      .mapErr(mapTokenStoreError);
  }

  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError> {
    return this.repository
      .consumeUserToken(hashOpaqueToken(token), purpose, tenantId)
      .map((entity: AuthUserTokenEntity | null) => (entity ? toUserActionTokenRecord(entity) : null))
      .mapErr(mapTokenStoreError);
  }
}
