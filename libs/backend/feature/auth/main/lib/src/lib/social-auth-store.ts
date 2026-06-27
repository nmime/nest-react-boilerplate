import { Injectable, Optional } from "@nestjs/common";
import { ResultAsync, okAsync } from "neverthrow";
import {
  AuthLinkTokenRepository,
  AuthMethodRepository,
  AuthProviderTokenRepository,
  ExternalIdentityRepository,
  NodeAesGcmProviderTokenCrypto,
  type AuthLinkTokenEntity,
  type AuthLinkTokenPurpose,
  type AuthMethodEntity,
  type AuthMethodType,
  type ExternalAuthProvider,
  type ExternalAuthProviderChannel,
  type ExternalIdentityEntity,
  type ProviderTokenCrypto,
} from "@app/backend/postgres/main/auth";
import type { AuthProviderTokenKind } from "@app/backend/postgres/main/auth";

export interface SocialAuthStoreError {
  code: "repository_error";
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
  listIdentities(
    userId: string,
    tenantId: string,
  ): ResultAsync<ExternalIdentityRecord[], SocialAuthStoreError>;
  upsertIdentity(
    input: UpsertIdentityInput,
  ): ResultAsync<ExternalIdentityRecord, SocialAuthStoreError>;
  deleteIdentity(
    identityId: string,
    userId: string,
    tenantId: string,
  ): ResultAsync<boolean, SocialAuthStoreError>;
  upsertMethod(input: {
    tenantId: string;
    userId: string;
    method: AuthMethodType;
    amr: string[];
    externalIdentityId?: string | null;
    lastUsedAt?: Date | null;
  }): ResultAsync<AuthMethodRecord, SocialAuthStoreError>;
  listMethods(
    userId: string,
    tenantId: string,
  ): ResultAsync<AuthMethodRecord[], SocialAuthStoreError>;
  countMethods(
    userId: string,
    tenantId: string,
  ): ResultAsync<number, SocialAuthStoreError>;
  createLinkToken(
    input: CreateLinkTokenInput,
  ): ResultAsync<LinkTokenRecord, SocialAuthStoreError>;
  consumeLinkToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId: string,
    now?: Date,
  ): ResultAsync<LinkTokenRecord | null, SocialAuthStoreError>;
  revokeLinkToken(
    tokenHash: string,
    tenantId: string,
    now?: Date,
  ): ResultAsync<boolean, SocialAuthStoreError>;
  persistProviderToken(
    input: PersistProviderTokenInput,
  ): ResultAsync<boolean, SocialAuthStoreError>;
  revokeProviderTokens(
    externalIdentityId: string,
    tenantId: string,
  ): ResultAsync<number, SocialAuthStoreError>;
}

export const SOCIAL_AUTH_STORE = Symbol("SOCIAL_AUTH_STORE");

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
      .map((value) => (value ? toIdentityRecord(value) : null));
  }

  listIdentities(
    userId: string,
    tenantId: string,
  ): ResultAsync<ExternalIdentityRecord[], SocialAuthStoreError> {
    return this.identities
      .findByUser(userId, tenantId)
      .map((items) => items.map(toIdentityRecord));
  }

  upsertIdentity(
    input: UpsertIdentityInput,
  ): ResultAsync<ExternalIdentityRecord, SocialAuthStoreError> {
    return this.identities.upsertIdentity(input).map(toIdentityRecord);
  }

  deleteIdentity(
    identityId: string,
    userId: string,
    tenantId: string,
  ): ResultAsync<boolean, SocialAuthStoreError> {
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

  listMethods(
    userId: string,
    tenantId: string,
  ): ResultAsync<AuthMethodRecord[], SocialAuthStoreError> {
    return this.methods
      .findByUser(userId, tenantId)
      .map((items) => items.map(toMethodRecord));
  }

  countMethods(
    userId: string,
    tenantId: string,
  ): ResultAsync<number, SocialAuthStoreError> {
    return this.methods.countUsableMethodsForUser(userId, tenantId);
  }

  createLinkToken(
    input: CreateLinkTokenInput,
  ): ResultAsync<LinkTokenRecord, SocialAuthStoreError> {
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
      .map((value) => (value ? toLinkTokenRecord(value) : null));
  }

  revokeLinkToken(
    tokenHash: string,
    tenantId: string,
    now: Date = new Date(),
  ): ResultAsync<boolean, SocialAuthStoreError> {
    return this.linkTokens.revokeToken(tokenHash, tenantId, now);
  }

  persistProviderToken(
    input: PersistProviderTokenInput,
  ): ResultAsync<boolean, SocialAuthStoreError> {
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

  revokeProviderTokens(
    externalIdentityId: string,
    tenantId: string,
  ): ResultAsync<number, SocialAuthStoreError> {
    return this.providerTokens
      .listRedactedByExternalIdentity(externalIdentityId, tenantId)
      .andThen((tokens) =>
        ResultAsync.fromPromise(
          Promise.all(
            tokens
              .filter((token) => !token.revokedAt)
              .map((token) =>
                this.providerTokens.revokeToken(token.id, tenantId).match(
                  () => 1,
                  () => 0,
                ),
              ),
          ).then((counts) => counts.reduce((sum, count) => sum + count, 0)),
          (cause) => ({
            code: "repository_error" as const,
            message:
              cause instanceof Error
                ? cause.message
                : "Provider token revoke failed.",
          }),
        ),
      );
  }
}

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

function toIdentityRecord(
  entity: ExternalIdentityEntity,
): ExternalIdentityRecord {
  return { ...entity };
}

function toMethodRecord(entity: AuthMethodEntity): AuthMethodRecord {
  return { ...entity };
}

function toLinkTokenRecord(entity: AuthLinkTokenEntity): LinkTokenRecord {
  return { ...entity };
}

function identityKey(
  tenantId: string,
  provider: string,
  providerSubject: string,
): string {
  return `${tenantId}:${provider}:${providerSubject}`;
}

function createEnvProviderTokenCrypto(): ProviderTokenCrypto | null {
  if (process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED !== "true") {
    return null;
  }
  const raw = process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    return null;
  }
  const key = Buffer.from(raw, raw.includes("=") ? "base64" : "hex");
  if (key.length !== 32) {
    return null;
  }
  return new NodeAesGcmProviderTokenCrypto(() => ({
    key,
    keyId: process.env.AUTH_PROVIDER_TOKEN_KEY_ID?.trim() || "env",
  }));
}
