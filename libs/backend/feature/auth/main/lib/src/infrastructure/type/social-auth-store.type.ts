import type { ResultAsync } from 'neverthrow';
import type {
  AuthLinkTokenPurpose,
  AuthMethodType,
  AuthProviderTokenKind,
  ExternalAuthProvider,
  ExternalAuthProviderChannel,
} from '@app/backend-feature-auth-shared';

export interface SocialAuthStoreError {
  code: 'repository_error';
  message: string;
}

export interface ExternalIdentityRecord {
  id: string;
  tenantId: string;
  userId: string;
  provider: ExternalAuthProvider;
  providerSubject: string;
  channel: ExternalAuthProviderChannel;
  profileMetadata: Record<string, unknown>;
  email: string | null;
  emailVerified: boolean | null;
  locale: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
  lastAuthenticatedAt: Date | null;
  linkedAt: Date;
}

export interface AuthMethodRecord {
  id: string;
  tenantId: string;
  userId: string;
  method: AuthMethodType;
  amr: string[];
  externalIdentityId: string | null;
  lastUsedAt: Date | null;
}

export interface LinkTokenRecord {
  id: string;
  tenantId: string;
  userId: string | null;
  provider: ExternalAuthProvider;
  purpose: AuthLinkTokenPurpose;
  tokenHash: string;
  nonce: string | null;
  deepLinkMetadata: Record<string, unknown>;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

export interface UpsertIdentityInput {
  tenantId: string;
  userId: string;
  provider: ExternalAuthProvider;
  providerSubject: string;
  channel: ExternalAuthProviderChannel;
  profileMetadata?: Record<string, unknown>;
  email?: string | null;
  emailVerified?: boolean | null;
  locale?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
  lastAuthenticatedAt?: Date | null;
}

export interface CreateLinkTokenInput {
  tenantId: string;
  userId?: string | null;
  provider: ExternalAuthProvider;
  purpose: AuthLinkTokenPurpose;
  tokenHash: string;
  nonce?: string | null;
  deepLinkMetadata?: Record<string, unknown>;
  expiresAt: Date;
}

export interface PersistProviderTokenInput {
  tenantId: string;
  userId: string;
  externalIdentityId: string;
  provider: ExternalAuthProvider;
  tokenKind: AuthProviderTokenKind;
  plaintext: string;
  scopes?: string[];
  expiresAt?: Date | null;
}

export interface SocialAuthStore {
  findIdentity(
    provider: ExternalAuthProvider,
    providerSubject: string,
    tenantId: string,
  ): ResultAsync<ExternalIdentityRecord | null, SocialAuthStoreError>;
  listIdentities(userId: string, tenantId: string): ResultAsync<ExternalIdentityRecord[], SocialAuthStoreError>;
  upsertIdentity(input: UpsertIdentityInput): ResultAsync<ExternalIdentityRecord, SocialAuthStoreError>;
  deleteIdentity(identityId: string, userId: string, tenantId: string): ResultAsync<boolean, SocialAuthStoreError>;
  upsertMethod(input: {
    tenantId: string;
    userId: string;
    method: AuthMethodType;
    amr: string[];
    externalIdentityId?: string | null;
    lastUsedAt?: Date | null;
  }): ResultAsync<AuthMethodRecord, SocialAuthStoreError>;
  listMethods(userId: string, tenantId: string): ResultAsync<AuthMethodRecord[], SocialAuthStoreError>;
  countMethods(userId: string, tenantId: string): ResultAsync<number, SocialAuthStoreError>;
  createLinkToken(input: CreateLinkTokenInput): ResultAsync<LinkTokenRecord, SocialAuthStoreError>;
  consumeLinkToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId: string,
    now?: Date,
  ): ResultAsync<LinkTokenRecord | null, SocialAuthStoreError>;
  revokeLinkToken(tokenHash: string, tenantId: string, now?: Date): ResultAsync<boolean, SocialAuthStoreError>;
  persistProviderToken(input: PersistProviderTokenInput): ResultAsync<boolean, SocialAuthStoreError>;
  revokeProviderTokens(externalIdentityId: string, tenantId: string): ResultAsync<number, SocialAuthStoreError>;
}
