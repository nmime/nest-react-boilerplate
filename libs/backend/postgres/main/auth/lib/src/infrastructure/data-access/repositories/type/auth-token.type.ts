import type { AuthUserTokenPurpose } from '../../entities';

export interface AuthTokenRepositoryError {
  code: 'repository_error';
  message: string;
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
  userTokensDeleted: number;
}
