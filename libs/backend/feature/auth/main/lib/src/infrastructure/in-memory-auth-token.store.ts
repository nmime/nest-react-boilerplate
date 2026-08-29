import { Injectable } from '@nestjs/common';
import { okAsync, ResultAsync } from 'neverthrow';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import type {
  AuthTokenStore,
  AuthTokenStoreError,
  AuthUserTokenPurpose,
  IssuedUserActionToken,
  UserActionTokenIssueInput,
  UserActionTokenRecord,
} from './type/auth-token-store.type';
import { hashOpaqueToken } from './factory/auth-token-crypto.factory';
import { createIssuedUserActionToken } from './factory/auth-token.factory';

@Injectable()
export class InMemoryAuthTokenStore implements AuthTokenStore {
  private readonly userTokensByHash = new Map<string, UserActionTokenRecord>();

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

  revokeUserActionToken(tokenHash: string, tenantId?: string): ResultAsync<boolean, AuthTokenStoreError> {
    const record = this.userTokensByHash.get(tokenHash);
    if (!record || record.tenantId !== (tenantId ?? DefaultAuthTenantId)) {
      return okAsync(false);
    }
    this.userTokensByHash.delete(tokenHash);
    return okAsync(true);
  }

  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string | null,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError> {
    const tokenHash = hashOpaqueToken(token);
    const record = this.userTokensByHash.get(tokenHash) ?? null;
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt <= new Date() ||
      (tenantId !== null && tenantId !== undefined && record.tenantId !== tenantId)
    ) {
      return okAsync(null);
    }

    record.consumedAt = new Date();
    return okAsync(record);
  }
}
