import { Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { AuthTokenRepository, type AuthUserTokenEntity } from '@app/backend-postgres-main-auth';
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
import { mapTokenStoreError, toUserActionTokenRecord } from './util/auth-token-store.util';

/* v8 ignore start -- Nest decorator metadata is framework glue, not runtime branch logic. */
@Injectable()
export class PostgresAuthTokenStore implements AuthTokenStore {
  constructor(private readonly repository: AuthTokenRepository) {}
  /* v8 ignore stop */

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
