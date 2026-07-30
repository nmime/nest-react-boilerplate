import { Inject, Injectable, Optional } from '@nestjs/common';
import { ResultAsync, okAsync } from 'neverthrow';
import {
  AuthLinkTokenRepositoryInjectToken,
  AuthMethodRepositoryInjectToken,
  AuthProviderTokenRepositoryInjectToken,
  ExternalIdentityRepositoryInjectToken,
  type AuthLinkTokenPurpose,
  type AuthLinkTokenRecord as PersistedAuthLinkTokenRecord,
  type AuthMethodPersistenceRecord as PersistedAuthMethodRecord,
  type AuthMethodType,
  type ExternalAuthProvider,
  type ExternalIdentityPersistenceRecord as PersistedExternalIdentityRecord,
  type AuthLinkTokenRepositoryPort,
  type AuthMethodRepositoryPort,
  type AuthProviderTokenRepositoryPort,
  type ExternalIdentityRepositoryPort,
  type ProviderTokenCrypto,
  type RedactedAuthProviderTokenView,
} from '@app/backend-feature-auth-shared';
import type {
  AuthMethodRecord,
  CreateLinkTokenInput,
  ExternalIdentityRecord,
  LinkTokenRecord,
  PersistProviderTokenInput,
  SocialAuthStore,
  SocialAuthStoreError,
  UpsertIdentityInput,
} from './type/social-auth-store.type';
import { toIdentityRecord, toLinkTokenRecord, toMethodRecord } from './util/social-auth-store.util';
import { createEnvProviderTokenCrypto } from './factory/social-auth-crypto.factory';

@Injectable()
export class PostgresSocialAuthStore implements SocialAuthStore {
  private readonly crypto: ProviderTokenCrypto | null;

  constructor(
    @Inject(ExternalIdentityRepositoryInjectToken) private readonly identities: ExternalIdentityRepositoryPort,
    @Inject(AuthMethodRepositoryInjectToken) private readonly methods: AuthMethodRepositoryPort,
    @Inject(AuthLinkTokenRepositoryInjectToken) private readonly linkTokens: AuthLinkTokenRepositoryPort,
    @Inject(AuthProviderTokenRepositoryInjectToken) private readonly providerTokens: AuthProviderTokenRepositoryPort,
    @Optional() crypto?: ProviderTokenCrypto,
  ) {
    this.crypto = crypto ?? createEnvProviderTokenCrypto();
  }

  findIdentity(
    provider: ExternalAuthProvider,
    providerSubject: string,
    tenantId: string,
  ): ResultAsync<ExternalIdentityRecord | null, SocialAuthStoreError> {
    return this.identities
      .findByProviderSubject(provider, providerSubject, tenantId)
      .map((value: PersistedExternalIdentityRecord | null) => (value ? toIdentityRecord(value) : null));
  }

  listIdentities(userId: string, tenantId: string): ResultAsync<ExternalIdentityRecord[], SocialAuthStoreError> {
    return this.identities
      .findByUser(userId, tenantId)
      .map((items: PersistedExternalIdentityRecord[]) => items.map(toIdentityRecord));
  }

  upsertIdentity(input: UpsertIdentityInput): ResultAsync<ExternalIdentityRecord, SocialAuthStoreError> {
    return this.identities.upsertIdentity(input).map(toIdentityRecord);
  }

  deleteIdentity(identityId: string, userId: string, tenantId: string): ResultAsync<boolean, SocialAuthStoreError> {
    return this.identities.deleteById(identityId, userId, tenantId);
  }

  upsertMethod(input: {
    tenantId: string;
    userId: string;
    method: AuthMethodType;
    amr: string[];
    externalIdentityId?: string | null;
    lastUsedAt?: Date | null;
  }): ResultAsync<AuthMethodRecord, SocialAuthStoreError> {
    return this.methods.upsertMethod(input).map(toMethodRecord);
  }

  listMethods(userId: string, tenantId: string): ResultAsync<AuthMethodRecord[], SocialAuthStoreError> {
    return this.methods
      .findByUser(userId, tenantId)
      .map((items: PersistedAuthMethodRecord[]) => items.map(toMethodRecord));
  }

  countMethods(userId: string, tenantId: string): ResultAsync<number, SocialAuthStoreError> {
    return this.methods.countUsableMethodsForUser(userId, tenantId);
  }

  createLinkToken(input: CreateLinkTokenInput): ResultAsync<LinkTokenRecord, SocialAuthStoreError> {
    return this.linkTokens.createToken(input).map(toLinkTokenRecord);
  }

  consumeLinkToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId: string,
    now: Date = new Date(),
  ): ResultAsync<LinkTokenRecord | null, SocialAuthStoreError> {
    return this.linkTokens
      .consumeToken(tokenHash, purpose, tenantId, now)
      .map((value: PersistedAuthLinkTokenRecord | null) => (value ? toLinkTokenRecord(value) : null));
  }

  revokeLinkToken(
    tokenHash: string,
    tenantId: string,
    now: Date = new Date(),
  ): ResultAsync<boolean, SocialAuthStoreError> {
    return this.linkTokens.revokeToken(tokenHash, tenantId, now);
  }

  persistProviderToken(input: PersistProviderTokenInput): ResultAsync<boolean, SocialAuthStoreError> {
    if (!this.crypto) {
      return okAsync(false);
    }
    const encrypted = this.crypto.encrypt({
      plaintext: input.plaintext,
      aad: `${input.tenantId}:${input.userId}:${input.externalIdentityId}:${input.provider}:${input.tokenKind}`,
    });
    return this.providerTokens
      .persistEncryptedToken({
        ...encrypted,
        tenantId: input.tenantId,
        userId: input.userId,
        externalIdentityId: input.externalIdentityId,
        provider: input.provider,
        tokenKind: input.tokenKind,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
      })
      .map(() => true);
  }

  revokeProviderTokens(externalIdentityId: string, tenantId: string): ResultAsync<number, SocialAuthStoreError> {
    return this.providerTokens
      .listRedactedByExternalIdentity(externalIdentityId, tenantId)
      .andThen((tokens: RedactedAuthProviderTokenView[]) =>
        ResultAsync.fromPromise(
          Promise.all(
            tokens
              .filter((token: RedactedAuthProviderTokenView) => !token.revokedAt)
              .map((token: RedactedAuthProviderTokenView) =>
                this.providerTokens.revokeToken(token.id, tenantId).match(
                  () => 1,
                  () => 0,
                ),
              ),
          ).then((counts: number[]) => counts.reduce((sum: number, count: number) => sum + count, 0)),
          (cause) => ({
            code: 'repository_error' as const,
            message: cause instanceof Error ? cause.message : 'Provider token revoke failed.',
          }),
        ),
      );
  }
}

@Injectable()
export class MongoSocialAuthStore extends PostgresSocialAuthStore {
  constructor(
    @Inject(ExternalIdentityRepositoryInjectToken) identities: ExternalIdentityRepositoryPort,
    @Inject(AuthMethodRepositoryInjectToken) methods: AuthMethodRepositoryPort,
    @Inject(AuthLinkTokenRepositoryInjectToken) linkTokens: AuthLinkTokenRepositoryPort,
    @Inject(AuthProviderTokenRepositoryInjectToken) providerTokens: AuthProviderTokenRepositoryPort,
    @Optional() crypto?: ProviderTokenCrypto,
  ) {
    super(identities, methods, linkTokens, providerTokens, crypto);
  }
}
