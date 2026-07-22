import type { ResultAsync } from 'neverthrow';

export type AuthUserTokenPurpose = 'email_verification' | 'password_reset';

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
  issueUserActionToken(input: UserActionTokenIssueInput): ResultAsync<IssuedUserActionToken, AuthTokenStoreError>;
  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError>;
}
