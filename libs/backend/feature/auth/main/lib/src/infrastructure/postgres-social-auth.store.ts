import { Injectable, Optional } from '@nestjs/common';
import { ResultAsync, okAsync } from 'neverthrow';
import {
  AuthLinkTokenRepository,
  AuthMethodRepository,
  AuthProviderTokenRepository,
  ExternalIdentityRepository,
  type AuthLinkTokenPurpose,
  type AuthLinkTokenEntity,
  type AuthMethodEntity,
  type AuthMethodType,
  type ExternalAuthProvider,
  type ExternalIdentityEntity,
  type ProviderTokenCrypto,
  type RedactedAuthProviderTokenView,
} from '@app/backend-postgres-main-auth';
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
    private readonly identities: ExternalIdentityRepository,
    private readonly methods: AuthMethodRepository,
    private readonly linkTokens: AuthLinkTokenRepository,
    private readonly providerTokens: AuthProviderTokenRepository,
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
      .map((value: ExternalIdentityEntity | null) => (value ? toIdentityRecord(value) : null));
  }

  listIdentities(userId: string, tenantId: string): ResultAsync<ExternalIdentityRecord[], SocialAuthStoreError> {
    return this.identities
      .findByUser(userId, tenantId)
      .map((items: ExternalIdentityEntity[]) => items.map(toIdentityRecord));
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
    return this.methods.findByUser(userId, tenantId).map((items: AuthMethodEntity[]) => items.map(toMethodRecord));
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
      .map((value: AuthLinkTokenEntity | null) => (value ? toLinkTokenRecord(value) : null));
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
