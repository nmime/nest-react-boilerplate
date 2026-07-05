import { Injectable } from "@nestjs/common";
import { ResultAsync, okAsync } from "neverthrow";
import type {
  AuthLinkTokenPurpose,
  AuthMethodType,
  ExternalAuthProvider,
} from "@app/backend-postgres-main-auth";
import type {
  AuthMethodRecord,
  CreateLinkTokenInput,
  ExternalIdentityRecord,
  LinkTokenRecord,
  PersistProviderTokenInput,
  SocialAuthStore,
  SocialAuthStoreError,
  UpsertIdentityInput,
} from "./type/social-auth-store.type";
import { identityKey } from "./util/social-auth-store.util";

@Injectable()
export class InMemorySocialAuthStore implements SocialAuthStore {
  private readonly identitiesById = new Map<string, ExternalIdentityRecord>();
  private readonly identityIdsByKey = new Map<string, string>();
  private readonly methodsById = new Map<string, AuthMethodRecord>();
  private readonly linkTokensByHash = new Map<string, LinkTokenRecord>();
  private readonly providerTokenExternalIds = new Map<string, number>();

  findIdentity(
    provider: ExternalAuthProvider,
    providerSubject: string,
    tenantId: string,
  ): ResultAsync<ExternalIdentityRecord | null, SocialAuthStoreError> {
    const id = this.identityIdsByKey.get(
      identityKey(tenantId, provider, providerSubject),
    );
    return okAsync(id ? (this.identitiesById.get(id) ?? null) : null);
  }

  listIdentities(
    userId: string,
    tenantId: string,
  ): ResultAsync<ExternalIdentityRecord[], SocialAuthStoreError> {
    return okAsync(
      [...this.identitiesById.values()].filter(
        (identity) =>
          identity.userId === userId && identity.tenantId === tenantId,
      ),
    );
  }

  upsertIdentity(
    input: UpsertIdentityInput,
  ): ResultAsync<ExternalIdentityRecord, SocialAuthStoreError> {
    const key = identityKey(
      input.tenantId,
      input.provider,
      input.providerSubject,
    );
    const existing = this.identityIdsByKey.get(key);
    const current = existing ? this.identitiesById.get(existing) : null;
    const record: ExternalIdentityRecord = {
      id: current?.id ?? crypto.randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      channel: input.channel,
      profileMetadata: input.profileMetadata ?? current?.profileMetadata ?? {},
      email: input.email?.trim() || null,
      emailVerified: input.emailVerified ?? null,
      locale: input.locale?.trim() || null,
      avatarUrl: input.avatarUrl?.trim() || null,
      displayName: input.displayName?.trim() || null,
      username: input.username?.trim() || null,
      lastAuthenticatedAt: input.lastAuthenticatedAt ?? new Date(),
      linkedAt: current?.linkedAt ?? new Date(),
    };
    this.identitiesById.set(record.id, record);
    this.identityIdsByKey.set(key, record.id);
    return okAsync(record);
  }

  deleteIdentity(
    identityId: string,
    userId: string,
    tenantId: string,
  ): ResultAsync<boolean, SocialAuthStoreError> {
    const record = this.identitiesById.get(identityId);
    if (!record || record.userId !== userId || record.tenantId !== tenantId) {
      return okAsync(false);
    }
    this.identitiesById.delete(identityId);
    this.identityIdsByKey.delete(
      identityKey(record.tenantId, record.provider, record.providerSubject),
    );
    return okAsync(true);
  }

  upsertMethod(input: {
    tenantId: string;
    userId: string;
    method: AuthMethodType;
    amr: string[];
    externalIdentityId?: string | null;
    lastUsedAt?: Date | null;
  }): ResultAsync<AuthMethodRecord, SocialAuthStoreError> {
    const existing = [...this.methodsById.values()].find(
      (method) =>
        method.tenantId === input.tenantId &&
        method.userId === input.userId &&
        method.method === input.method &&
        method.externalIdentityId === (input.externalIdentityId ?? null),
    );
    const record: AuthMethodRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      method: input.method,
      amr: input.amr,
      externalIdentityId: input.externalIdentityId ?? null,
      lastUsedAt: input.lastUsedAt ?? existing?.lastUsedAt ?? null,
    };
    this.methodsById.set(record.id, record);
    return okAsync(record);
  }

  listMethods(
    userId: string,
    tenantId: string,
  ): ResultAsync<AuthMethodRecord[], SocialAuthStoreError> {
    return okAsync(
      [...this.methodsById.values()].filter(
        (method) => method.userId === userId && method.tenantId === tenantId,
      ),
    );
  }

  countMethods(
    userId: string,
    tenantId: string,
  ): ResultAsync<number, SocialAuthStoreError> {
    return this.listMethods(userId, tenantId).map((items) => items.length);
  }

  createLinkToken(
    input: CreateLinkTokenInput,
  ): ResultAsync<LinkTokenRecord, SocialAuthStoreError> {
    const record: LinkTokenRecord = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      provider: input.provider,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      nonce: input.nonce?.trim() || null,
      deepLinkMetadata: input.deepLinkMetadata ?? {},
      expiresAt: input.expiresAt,
      consumedAt: null,
      revokedAt: null,
    };
    this.linkTokensByHash.set(record.tokenHash, record);
    return okAsync(record);
  }

  consumeLinkToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId: string,
    now: Date = new Date(),
  ): ResultAsync<LinkTokenRecord | null, SocialAuthStoreError> {
    const record = this.linkTokensByHash.get(tokenHash) ?? null;
    if (
      !record ||
      record.purpose !== purpose ||
      record.tenantId !== tenantId ||
      record.consumedAt ||
      record.revokedAt ||
      record.expiresAt <= now
    ) {
      return okAsync(null);
    }
    const consumed = { ...record, consumedAt: now };
    this.linkTokensByHash.set(tokenHash, consumed);
    return okAsync(consumed);
  }

  revokeLinkToken(
    tokenHash: string,
    tenantId: string,
    now: Date = new Date(),
  ): ResultAsync<boolean, SocialAuthStoreError> {
    const record = this.linkTokensByHash.get(tokenHash);
    if (
      !record ||
      record.tenantId !== tenantId ||
      record.consumedAt ||
      record.revokedAt ||
      record.expiresAt <= now
    ) {
      return okAsync(false);
    }
    this.linkTokensByHash.set(tokenHash, { ...record, revokedAt: now });
    return okAsync(true);
  }

  persistProviderToken(
    input: PersistProviderTokenInput,
  ): ResultAsync<boolean, SocialAuthStoreError> {
    const key = `${input.tenantId}:${input.externalIdentityId}`;
    this.providerTokenExternalIds.set(
      key,
      (this.providerTokenExternalIds.get(key) ?? 0) + 1,
    );
    return okAsync(true);
  }

  revokeProviderTokens(
    externalIdentityId: string,
    tenantId: string,
  ): ResultAsync<number, SocialAuthStoreError> {
    const key = `${tenantId}:${externalIdentityId}`;
    const count = this.providerTokenExternalIds.get(key) ?? 0;
    this.providerTokenExternalIds.set(key, 0);
    return okAsync(count);
  }
}
