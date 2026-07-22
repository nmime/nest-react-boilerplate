import type { AuthUserTokenEntity } from '@app/backend-postgres-main-auth';
import type { AuthTokenStoreError, AuthUserTokenPurpose, UserActionTokenRecord } from '../type/auth-token-store.type';
import {
  DefaultEmailVerificationTtlSeconds,
  DefaultPasswordResetTtlSeconds,
} from '../const/auth-token-store-ttl.const';

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
