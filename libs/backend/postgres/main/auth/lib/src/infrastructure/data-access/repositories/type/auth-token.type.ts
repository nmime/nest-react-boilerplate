import type { AuthRefreshTokenAuthContext, AuthUserTokenPurpose } from '../../entities';

export interface AuthTokenRepositoryError {
  code: 'repository_error';
  message: string;
}

export interface PersistAuthRefreshTokenInput {
  id: string;
  tenantId?: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  parentTokenId?: string | null;
  expiresAt: Date;
  authContext?: AuthRefreshTokenAuthContext | null;
}

export interface RotateAuthRefreshTokenInput {
  tokenHash: string;
  tenantId?: string;
  replacement: {
    id: string;
    tokenHash: string;
    expiresAt: Date;
  };
  now?: Date;
}

export interface PersistAuthUserTokenInput {
  id: string;
  tenantId?: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthTokenCleanupResult {
  refreshTokensDeleted: number;
  userTokensDeleted: number;
}
