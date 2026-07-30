import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DefaultAuthTenantId,
  type AuthLinkTokenPurpose,
  type AuthLinkTokenRecord,
  type AuthLinkTokenRepositoryPort,
  type AuthMethodPersistenceRecord,
  type AuthMethodRepositoryPort,
  type AuthProviderTokenRecord,
  type AuthProviderTokenRepositoryPort,
  type AuthRepositoryError,
  type CreateAuthLinkTokenInput,
  type ExternalAuthProvider,
  type ExternalIdentityPersistenceRecord,
  type ExternalIdentityRepositoryPort,
  type PersistAuthProviderTokenInput,
  type RedactedAuthProviderTokenView,
  type UpsertAuthMethodInput,
  type UpsertExternalIdentityInput,
} from '@app/backend-feature-auth-shared';
import type { Db } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { MongoDatabaseToken } from './mongo-runtime';
import { AuthMongoCollections } from './auth-mongo.collections';
import { collection, repositoryResult, withoutId, type MongoAuthDocument } from './auth-mongo.util';

@Injectable()
export class MongoExternalIdentityRepository implements ExternalIdentityRepositoryPort {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}
  upsertIdentity(
    input: UpsertExternalIdentityInput,
  ): ResultAsync<ExternalIdentityPersistenceRecord, AuthRepositoryError> {
    return repositoryResult(this.upsert(input));
  }
  findByProviderSubject(
    provider: ExternalAuthProvider,
    providerSubject: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<ExternalIdentityPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.identities)
        .findOne({ tenantId, provider, providerSubject })
        .then(toNullableIdentity),
    );
  }
  findByUser(
    userId: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<ExternalIdentityPersistenceRecord[], AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.identities)
        .find({ tenantId, userId })
        .sort({ linkedAt: 1 })
        .toArray()
        .then((items) => items.map(toIdentity)),
    );
  }
  deleteById(id: string, userId: string, tenantId = DefaultAuthTenantId): ResultAsync<boolean, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.identities)
        .deleteOne({ _id: id, userId, tenantId })
        .then((result) => result.deletedCount === 1),
    );
  }
  private async upsert(input: UpsertExternalIdentityInput): Promise<ExternalIdentityPersistenceRecord> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const now = new Date();
    const normalized = (value: string | null | undefined) => value?.trim() || null;
    const item = await collection(this.database, AuthMongoCollections.identities).findOneAndUpdate(
      { tenantId, provider: input.provider, providerSubject: input.providerSubject },
      {
        $set: {
          userId: input.userId,
          channel: input.channel,
          profileMetadata: input.profileMetadata ?? {},
          email: normalized(input.email),
          emailVerified: input.emailVerified ?? null,
          locale: normalized(input.locale),
          avatarUrl: normalized(input.avatarUrl),
          displayName: normalized(input.displayName),
          username: normalized(input.username),
          lastAuthenticatedAt: input.lastAuthenticatedAt ?? now,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: randomUUID(),
          tenantId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          linkedAt: input.linkedAt ?? now,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!item) {
      throw new Error('MongoDB identity upsert returned no document.');
    }
    return toIdentity(item);
  }
}

@Injectable()
export class MongoAuthMethodRepository implements AuthMethodRepositoryPort {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}
  upsertMethod(input: UpsertAuthMethodInput): ResultAsync<AuthMethodPersistenceRecord, AuthRepositoryError> {
    return repositoryResult(this.upsert(input));
  }
  recordLastUsed(
    id: string,
    tenantId = DefaultAuthTenantId,
    lastUsedAt = new Date(),
  ): ResultAsync<AuthMethodPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.methods)
        .findOneAndUpdate(
          { _id: id, tenantId },
          { $set: { lastUsedAt, updatedAt: lastUsedAt } },
          { returnDocument: 'after', includeResultMetadata: false },
        )
        .then(toNullableMethod),
    );
  }
  findByUser(
    userId: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthMethodPersistenceRecord[], AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.methods)
        .find({ tenantId, userId })
        .sort({ lastUsedAt: -1, createdAt: -1 })
        .toArray()
        .then((items) => items.map(toMethod)),
    );
  }
  findLastUsedByUser(
    userId: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<AuthMethodPersistenceRecord | null, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.methods)
        .find({ tenantId, userId, lastUsedAt: { $ne: null } })
        .sort({ lastUsedAt: -1 })
        .limit(1)
        .next()
        .then(toNullableMethod),
    );
  }
  countUsableMethodsForUser(userId: string, tenantId = DefaultAuthTenantId): ResultAsync<number, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.methods).countDocuments({ tenantId, userId }),
    );
  }
  private async upsert(input: UpsertAuthMethodInput): Promise<AuthMethodPersistenceRecord> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const now = new Date();
    const externalIdentityId = input.externalIdentityId ?? null;
    const item = await collection(this.database, AuthMongoCollections.methods).findOneAndUpdate(
      { tenantId, userId: input.userId, method: input.method, externalIdentityId },
      {
        $set: {
          amr: input.amr ?? (input.method === 'password' ? ['pwd'] : [input.method]),
          lastUsedAt: input.lastUsedAt ?? null,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: randomUUID(),
          tenantId,
          userId: input.userId,
          method: input.method,
          externalIdentityId,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    );
    if (!item) {
      throw new Error('MongoDB auth method upsert returned no document.');
    }
    return toMethod(item);
  }
}

@Injectable()
export class MongoAuthLinkTokenRepository implements AuthLinkTokenRepositoryPort {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}
  createToken(input: CreateAuthLinkTokenInput): ResultAsync<AuthLinkTokenRecord, AuthRepositoryError> {
    return repositoryResult(this.create(input));
  }
  consumeToken(
    tokenHash: string,
    purpose: AuthLinkTokenPurpose,
    tenantId = DefaultAuthTenantId,
    now = new Date(),
  ): ResultAsync<AuthLinkTokenRecord | null, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.linkTokens)
        .findOneAndUpdate(
          { tokenHash, purpose, tenantId, consumedAt: null, revokedAt: null, expiresAt: { $gt: now } },
          { $set: { consumedAt: now, updatedAt: now } },
          { returnDocument: 'after', includeResultMetadata: false },
        )
        .then(toNullableLinkToken),
    );
  }
  revokeToken(
    tokenHash: string,
    tenantId = DefaultAuthTenantId,
    now = new Date(),
  ): ResultAsync<boolean, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.linkTokens)
        .findOneAndUpdate(
          { tokenHash, tenantId, consumedAt: null, revokedAt: null, expiresAt: { $gt: now } },
          { $set: { revokedAt: now, updatedAt: now } },
          { returnDocument: 'after', includeResultMetadata: false },
        )
        .then(Boolean),
    );
  }
  private async create(input: CreateAuthLinkTokenInput): Promise<AuthLinkTokenRecord> {
    const now = new Date();
    const item: MongoAuthDocument = {
      _id: input.id ?? randomUUID(),
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      userId: input.userId ?? null,
      provider: input.provider,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      nonce: input.nonce?.trim() || null,
      deepLinkMetadata: input.deepLinkMetadata ?? {},
      expiresAt: input.expiresAt,
      consumedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await collection(this.database, AuthMongoCollections.linkTokens).insertOne(item);
    return withoutId(item) as AuthLinkTokenRecord;
  }
}

@Injectable()
export class MongoAuthProviderTokenRepository implements AuthProviderTokenRepositoryPort {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}
  persistEncryptedToken(
    input: PersistAuthProviderTokenInput,
  ): ResultAsync<AuthProviderTokenRecord, AuthRepositoryError> {
    return repositoryResult(this.persist(input));
  }
  listRedactedByExternalIdentity(
    externalIdentityId: string,
    tenantId = DefaultAuthTenantId,
  ): ResultAsync<RedactedAuthProviderTokenView[], AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.providerTokens)
        .find({ tenantId, externalIdentityId })
        .sort({ createdAt: -1 })
        .toArray()
        .then((items) =>
          items.map((item) => {
            const token = withoutId(item) as AuthProviderTokenRecord;
            return {
              id: token.id,
              tenantId: token.tenantId,
              userId: token.userId,
              externalIdentityId: token.externalIdentityId,
              provider: token.provider,
              tokenKind: token.tokenKind,
              keyId: token.keyId,
              scopes: token.scopes,
              expiresAt: token.expiresAt,
              revokedAt: token.revokedAt,
              redacted: true,
            };
          }),
        ),
    );
  }
  revokeToken(
    id: string,
    tenantId = DefaultAuthTenantId,
    revokedAt = new Date(),
  ): ResultAsync<AuthProviderTokenRecord | null, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.providerTokens)
        .findOneAndUpdate(
          { _id: id, tenantId },
          { $set: { revokedAt, updatedAt: revokedAt } },
          { returnDocument: 'after', includeResultMetadata: false },
        )
        .then((item) => (item ? (withoutId(item) as AuthProviderTokenRecord) : null)),
    );
  }
  private async persist(input: PersistAuthProviderTokenInput): Promise<AuthProviderTokenRecord> {
    const now = new Date();
    const item: MongoAuthDocument = {
      _id: randomUUID(),
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      userId: input.userId,
      externalIdentityId: input.externalIdentityId,
      provider: input.provider ?? 'discord',
      tokenKind: input.tokenKind,
      ciphertext: input.ciphertext,
      iv: input.iv,
      authTag: input.authTag,
      keyId: input.keyId,
      scopes: input.scopes ?? [],
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await collection(this.database, AuthMongoCollections.providerTokens).insertOne(item);
    return withoutId(item) as AuthProviderTokenRecord;
  }
}

const toIdentity = (item: MongoAuthDocument): ExternalIdentityPersistenceRecord =>
  withoutId(item) as ExternalIdentityPersistenceRecord;
const toNullableIdentity = (item: MongoAuthDocument | null): ExternalIdentityPersistenceRecord | null =>
  item ? toIdentity(item) : null;
const toMethod = (item: MongoAuthDocument): AuthMethodPersistenceRecord =>
  withoutId(item) as AuthMethodPersistenceRecord;
const toNullableMethod = (item: MongoAuthDocument | null): AuthMethodPersistenceRecord | null =>
  item ? toMethod(item) : null;
const toLinkToken = (item: MongoAuthDocument): AuthLinkTokenRecord => withoutId(item) as AuthLinkTokenRecord;
const toNullableLinkToken = (item: MongoAuthDocument | null): AuthLinkTokenRecord | null =>
  item ? toLinkToken(item) : null;
