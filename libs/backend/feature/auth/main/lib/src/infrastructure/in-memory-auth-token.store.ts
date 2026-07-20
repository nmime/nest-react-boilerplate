import { Injectable } from '@nestjs/common';
import { okAsync, ResultAsync } from 'neverthrow';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
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
import { hashOpaqueToken } from './factory/auth-token-crypto.factory';
import { createIssuedRefreshToken, createIssuedUserActionToken } from './factory/auth-token.factory';

@Injectable()
export class InMemoryAuthTokenStore implements AuthTokenStore {
  private readonly refreshTokensByHash = new Map<string, RefreshTokenRecord>();
  private readonly userTokensByHash = new Map<string, UserActionTokenRecord>();

  issueRefreshToken(input: RefreshTokenIssueInput): ResultAsync<IssuedRefreshToken, AuthTokenStoreError> {
    const issued = createIssuedRefreshToken(input);
    this.refreshTokensByHash.set(issued.tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      tokenHash: issued.tokenHash,
      familyId: issued.familyId,
      /* v8 ignore next -- createRefreshToken is only used for rotations, which always provide a parent token id. */
      parentTokenId: input.parentTokenId ?? null,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedByTokenId: null,
      authContext: issued.authContext ?? null,
    });
    return okAsync(issued);
  }

  rotateRefreshToken(token: string, tenantId?: string): ResultAsync<IssuedRefreshToken | null, AuthTokenStoreError> {
    const record = this.getUsableRefreshToken(token, tenantId);
    if (!record) {
      this.revokeReusedTokenFamily(token, tenantId);
      return okAsync(null);
    }

    const issued = this.createRefreshToken({
      tenantId: record.tenantId,
      userId: record.userId,
      familyId: record.familyId,
      parentTokenId: record.id,
      // Carry the family's original authentication context forward unchanged.
      authContext: record.authContext ?? null,
    });
    record.revokedAt = new Date();
    record.replacedByTokenId = issued.id;
    return okAsync(issued);
  }

  revokeRefreshToken(token: string, tenantId?: string): ResultAsync<boolean, AuthTokenStoreError> {
    const record = this.getUsableRefreshToken(token, tenantId);
    if (!record) {
      return okAsync(false);
    }

    record.revokedAt = new Date();
    return okAsync(true);
  }

  findRefreshToken(token: string, tenantId?: string): ResultAsync<RefreshTokenRecord | null, AuthTokenStoreError> {
    return okAsync(this.getUsableRefreshToken(token, tenantId));
  }

  issueUserActionToken(input: UserActionTokenIssueInput): ResultAsync<IssuedUserActionToken, AuthTokenStoreError> {
    const issued = createIssuedUserActionToken(input);
    this.userTokensByHash.set(issued.tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      purpose: issued.purpose,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      consumedAt: null,
    });
    return okAsync(issued);
  }

  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError> {
    const tokenHash = hashOpaqueToken(token);
    const record = this.userTokensByHash.get(tokenHash) ?? null;
    const resolvedTenantId = tenantId ?? DefaultAuthTenantId;
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt <= new Date() ||
      record.tenantId !== resolvedTenantId
    ) {
      return okAsync(null);
    }

    record.consumedAt = new Date();
    return okAsync(record);
  }

  private createRefreshToken(input: RefreshTokenIssueInput): IssuedRefreshToken {
    const issued = createIssuedRefreshToken(input);
    this.refreshTokensByHash.set(issued.tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      tokenHash: issued.tokenHash,
      familyId: issued.familyId,
      /* v8 ignore next -- createRefreshToken is only used for rotations, which always provide a parent token id. */
      parentTokenId: input.parentTokenId ?? null,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedByTokenId: null,
      authContext: issued.authContext ?? null,
    });
    return issued;
  }

  private getUsableRefreshToken(token: string, tenantId?: string): RefreshTokenRecord | null {
    const tokenHash = hashOpaqueToken(token);
    const record = this.refreshTokensByHash.get(tokenHash) ?? null;
    const resolvedTenantId = tenantId ?? DefaultAuthTenantId;
    if (!record || record.revokedAt || record.expiresAt <= new Date() || record.tenantId !== resolvedTenantId) {
      return null;
    }

    return record;
  }

  private revokeReusedTokenFamily(token: string, tenantId?: string): void {
    const replayed = this.refreshTokensByHash.get(hashOpaqueToken(token));
    const resolvedTenantId = tenantId ?? DefaultAuthTenantId;
    if (!replayed?.revokedAt || replayed.tenantId !== resolvedTenantId) {
      return;
    }

    const revokedAt = new Date();
    for (const record of this.refreshTokensByHash.values()) {
      if (record.tenantId === resolvedTenantId && record.familyId === replayed.familyId && !record.revokedAt) {
        record.revokedAt = revokedAt;
      }
    }
  }
}
