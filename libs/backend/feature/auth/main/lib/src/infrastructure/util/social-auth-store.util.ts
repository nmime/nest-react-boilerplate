import type { AuthLinkTokenEntity, AuthMethodEntity, ExternalIdentityEntity } from '@app/backend-postgres-main-auth';
import type { AuthMethodRecord, ExternalIdentityRecord, LinkTokenRecord } from '../type/social-auth-store.type';

export function toIdentityRecord(entity: ExternalIdentityEntity): ExternalIdentityRecord {
  return { ...entity };
}

export function toMethodRecord(entity: AuthMethodEntity): AuthMethodRecord {
  return { ...entity };
}

export function toLinkTokenRecord(entity: AuthLinkTokenEntity): LinkTokenRecord {
  return { ...entity };
}

export function identityKey(tenantId: string, provider: string, providerSubject: string): string {
  return `${tenantId}:${provider}:${providerSubject}`;
}
