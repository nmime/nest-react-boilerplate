import { AuthProvider, AuthProviderChannel } from '@app/backend-feature-auth-shared';
import type {
  AuthRefreshTokenAuthContext,
  AuthRefreshTokenEntity,
  AuthUserTokenEntity,
} from '@app/backend-postgres-main-auth';
import type {
  AuthTokenStoreError,
  AuthUserTokenPurpose,
  RefreshTokenAuthContext,
  RefreshTokenRecord,
  UserActionTokenRecord,
} from '../type/auth-token-store.type';
import {
  DefaultEmailVerificationTtlSeconds,
  DefaultPasswordResetTtlSeconds,
} from '../const/auth-token-store-ttl.const';

// Map the persisted (string-typed) auth context back onto the typed store shape.
// Values were written from the enums originally, so narrowing back is safe.
export function toRefreshTokenAuthContext(
  context: AuthRefreshTokenAuthContext | null | undefined,
): RefreshTokenAuthContext | null {
  if (!context) {
    return null;
  }
  const mapped: RefreshTokenAuthContext = {
    ...(context.authTime !== undefined ? { authTime: context.authTime } : {}),
    ...(context.amr ? { amr: context.amr } : {}),
    ...(context.authProvider ? { authProvider: context.authProvider as AuthProvider } : {}),
    ...(context.authChannel ? { authChannel: context.authChannel as AuthProviderChannel } : {}),
  };
  // The DB column is NOT NULL and defaults to '{}' for legacy rows; treat an empty
  // persisted object as "no context" so it maps to null like the in-memory store.
  return Object.keys(mapped).length > 0 ? mapped : null;
}

export function toRefreshTokenRecord(entity: AuthRefreshTokenEntity): RefreshTokenRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    tokenHash: entity.tokenHash,
    familyId: entity.familyId,
    parentTokenId: entity.parentTokenId,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    replacedByTokenId: entity.replacedByTokenId,
    authContext: toRefreshTokenAuthContext(entity.authContext),
  };
}

export function toUserActionTokenRecord(entity: AuthUserTokenEntity): UserActionTokenRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    purpose: entity.purpose,
    tokenHash: entity.tokenHash,
    expiresAt: entity.expiresAt,
    consumedAt: entity.consumedAt,
  };
}

export function mapTokenStoreError(cause: { message?: string }): AuthTokenStoreError {
  return {
    code: 'token_store_error',
    message: cause.message ?? 'Auth token store failed.',
  };
}

export function secondsFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function defaultUserActionTokenTtl(purpose: AuthUserTokenPurpose): number {
  return purpose === 'email_verification' ? DefaultEmailVerificationTtlSeconds : DefaultPasswordResetTtlSeconds;
}
