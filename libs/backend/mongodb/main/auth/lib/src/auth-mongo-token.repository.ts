import { Inject, Injectable } from '@nestjs/common';
import {
  DefaultAuthTenantId,
  type AuthRepositoryError,
  type AuthTokenRepositoryPort,
  type AuthPersistenceUserTokenPurpose,
  type AuthUserTokenRecord,
  type PersistAuthUserTokenInput,
} from '@app/backend-feature-auth-shared';
import type { Db } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { MongoDatabaseToken } from './mongo-runtime';
import { AuthMongoCollections } from './auth-mongo.collections';
import { collection, repositoryResult, withoutId, type MongoAuthDocument } from './auth-mongo.util';

@Injectable()
export class MongoAuthTokenRepository implements AuthTokenRepositoryPort {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}
  createUserToken(input: PersistAuthUserTokenInput): ResultAsync<AuthUserTokenRecord, AuthRepositoryError> {
    return repositoryResult(this.create(input));
  }
  consumeUserToken(
    tokenHash: string,
    purpose: AuthPersistenceUserTokenPurpose,
    tenantId = DefaultAuthTenantId,
    now = new Date(),
  ): ResultAsync<AuthUserTokenRecord | null, AuthRepositoryError> {
    return repositoryResult(this.consume(tokenHash, purpose, tenantId, now));
  }
  cleanupExpiredTokens(before = new Date()): ResultAsync<{ userTokensDeleted: number }, AuthRepositoryError> {
    return repositoryResult(
      collection(this.database, AuthMongoCollections.userTokens)
        .deleteMany({ expiresAt: { $lte: before } })
        .then((result) => ({ userTokensDeleted: result.deletedCount })),
    );
  }
  private async create(input: PersistAuthUserTokenInput): Promise<AuthUserTokenRecord> {
    const now = new Date();
    const document: MongoAuthDocument = {
      _id: input.id,
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await collection(this.database, AuthMongoCollections.userTokens).insertOne(document);
    return withoutId(document) as AuthUserTokenRecord;
  }
  private async consume(
    tokenHash: string,
    purpose: AuthPersistenceUserTokenPurpose,
    tenantId: string,
    now: Date,
  ): Promise<AuthUserTokenRecord | null> {
    const document = await collection(this.database, AuthMongoCollections.userTokens).findOneAndUpdate(
      { tokenHash, purpose, tenantId, consumedAt: null, expiresAt: { $gt: now } },
      { $set: { consumedAt: now, updatedAt: now } },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return document ? (withoutId(document) as AuthUserTokenRecord) : null;
  }
}
