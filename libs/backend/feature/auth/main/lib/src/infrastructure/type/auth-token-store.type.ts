import type { ResultAsync } from 'neverthrow';
import type { AuthProvider, AuthProviderChannel } from '@app/backend-feature-auth-shared';

export type AuthUserTokenPurpose = 'email_verification' | 'password_reset';

/**
 * Authentication metadata captured when a refresh-token family is first issued
 * and carried forward unchanged across every rotation. Re-emitting it on refresh
 * keeps `auth_time` (and the authentication method) tied to the last real
 * authentication event, so a refresh — or a stolen refresh token — cannot reset
 * `auth_time` to "now" and silently satisfy the recent-auth (step-up) gate.
 */
export interface RefreshTokenAuthContext {
  authTime?: number;
  amr?: string[];
  authProvider?: AuthProvider;
  authChannel?: AuthProviderChannel;
}

export interface RefreshTokenIssueInput {
  tenantId: string;
  userId: string;
  ttlSeconds?: number;
  parentTokenId?: string | null;
  familyId?: string;
  authContext?: RefreshTokenAuthContext | null;
}

export interface IssuedRefreshToken {
  id: string;
  tenantId: string;
  userId: string;
  token: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  authContext?: RefreshTokenAuthContext | null;
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
  authContext?: RefreshTokenAuthContext | null;
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
