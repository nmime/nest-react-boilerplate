import { randomUUID } from 'node:crypto';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import type {
  IssuedRefreshToken,
  IssuedUserActionToken,
  RefreshTokenIssueInput,
  UserActionTokenIssueInput,
} from '../type/auth-token-store.type';
import { DefaultRefreshTokenTtlSeconds } from '../const/auth-token-store-ttl.const';
import { defaultUserActionTokenTtl, secondsFromNow } from '../util/auth-token-store.util';
import { createOpaqueToken, hashOpaqueToken } from './auth-token-crypto.factory';

export function createIssuedRefreshToken(input: RefreshTokenIssueInput): IssuedRefreshToken {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  return {
    id: randomUUID(),
    tenantId: input.tenantId || DefaultAuthTenantId,
    userId: input.userId,
    token,
    tokenHash,
    familyId: input.familyId ?? randomUUID(),
    expiresAt: secondsFromNow(input.ttlSeconds ?? DefaultRefreshTokenTtlSeconds),
  };
}

export function createIssuedUserActionToken(input: UserActionTokenIssueInput): IssuedUserActionToken {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  return {
    id: randomUUID(),
    tenantId: input.tenantId || DefaultAuthTenantId,
    userId: input.userId,
    purpose: input.purpose,
    token,
    tokenHash,
    expiresAt: secondsFromNow(input.ttlSeconds ?? defaultUserActionTokenTtl(input.purpose)),
  };
}
