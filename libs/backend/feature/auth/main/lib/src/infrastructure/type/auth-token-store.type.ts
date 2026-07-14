import type { ResultAsync } from 'neverthrow';

export type AuthUserTokenPurpose = 'email_verification' | 'password_reset';

export interface RefreshTokenIssueInput {
  tenantId: string;
  userId: string;
  ttlSeconds?: number;
  parentTokenId?: string | null;
  familyId?: string;
}

export interface IssuedRefreshToken {
  id: string;
  tenantId: string;
  userId: string;
  token: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  parentTokenId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}

export interface UserActionTokenIssueInput {
  tenantId: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  ttlSeconds?: number;
}

export interface IssuedUserActionToken {
  id: string;
  tenantId: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UserActionTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface AuthTokenStoreError {
  code: 'token_store_error';
  message: string;
}

export interface AuthTokenStore {
  issueRefreshToken(input: RefreshTokenIssueInput): ResultAsync<IssuedRefreshToken, AuthTokenStoreError>;
  rotateRefreshToken(token: string, tenantId?: string): ResultAsync<IssuedRefreshToken | null, AuthTokenStoreError>;
  revokeRefreshToken(token: string, tenantId?: string): ResultAsync<boolean, AuthTokenStoreError>;
  findRefreshToken(token: string, tenantId?: string): ResultAsync<RefreshTokenRecord | null, AuthTokenStoreError>;
  issueUserActionToken(input: UserActionTokenIssueInput): ResultAsync<IssuedUserActionToken, AuthTokenStoreError>;
  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError>;
}
