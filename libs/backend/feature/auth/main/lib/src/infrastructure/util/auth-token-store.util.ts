import type { AuthRefreshTokenEntity, AuthUserTokenEntity } from '@app/backend-postgres-main-auth';
import type {
  AuthTokenStoreError,
  AuthUserTokenPurpose,
  RefreshTokenRecord,
  UserActionTokenRecord,
} from '../type/auth-token-store.type';
import {
  DefaultEmailVerificationTtlSeconds,
  DefaultPasswordResetTtlSeconds,
} from '../const/auth-token-store-ttl.const';

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
