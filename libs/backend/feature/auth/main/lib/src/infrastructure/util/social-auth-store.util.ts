import type {
  AuthLinkTokenRecord as PersistedAuthLinkTokenRecord,
  AuthMethodPersistenceRecord as PersistedAuthMethodRecord,
  ExternalIdentityPersistenceRecord as PersistedExternalIdentityRecord,
} from '@app/backend-feature-auth-shared';
import type { AuthMethodRecord, ExternalIdentityRecord, LinkTokenRecord } from '../type/social-auth-store.type';

export function toIdentityRecord(entity: PersistedExternalIdentityRecord): ExternalIdentityRecord {
  return { ...entity };
}

export function toMethodRecord(entity: PersistedAuthMethodRecord): AuthMethodRecord {
  return { ...entity };
}

export function toLinkTokenRecord(entity: PersistedAuthLinkTokenRecord): LinkTokenRecord {
  return { ...entity };
}

export function identityKey(tenantId: string, provider: string, providerSubject: string): string {
  return `${tenantId}:${provider}:${providerSubject}`;
}
