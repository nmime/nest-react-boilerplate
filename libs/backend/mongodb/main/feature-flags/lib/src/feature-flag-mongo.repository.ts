import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MongoDatabaseToken } from '@app/backend-mongodb-main';
import {
  DefaultFeatureFlagTenantId,
  type FeatureFlagContext,
  type FeatureFlagSnapshot,
  type FeatureFlagValue,
} from '@app/common-feature-flags';
import type { ClientSession, Collection, Db } from 'mongodb';
import { ResultAsync } from 'neverthrow';
import { FeatureFlagCollectionName } from './feature-flag-mongo.collection';
import type {
  FeatureFlagDocument,
  MongoFeatureFlag,
  MongoFeatureFlagRepositoryError,
  MongoFeatureFlagUpsertInput,
} from './feature-flag-mongo.types';

const featureFlagKeyPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/u;
const tenantIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

@Injectable()
export class MongoFeatureFlagRepository {
  private readonly collection: Collection<FeatureFlagDocument>;

  constructor(@Inject(MongoDatabaseToken) database: Db) {
    this.collection = database.collection<FeatureFlagDocument>(FeatureFlagCollectionName);
  }

  findByKey(
    key: string,
    tenantId: string = DefaultFeatureFlagTenantId,
    transactionContext?: unknown,
  ): ResultAsync<MongoFeatureFlag | null, MongoFeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(
      this.findValidated(key, tenantId, sessionFrom(transactionContext)),
      mapRepositoryError,
    );
  }

  list(
    context: FeatureFlagContext = {},
    transactionContext?: unknown,
  ): ResultAsync<MongoFeatureFlag[], MongoFeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(
      this.listValidated(resolveMongoFeatureFlagTenantId(context), sessionFrom(transactionContext)),
      mapRepositoryError,
    );
  }

  listEnabled(context: FeatureFlagContext = {}): ResultAsync<MongoFeatureFlag[], MongoFeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(
      this.listEnabledValidated(resolveMongoFeatureFlagTenantId(context)),
      mapRepositoryError,
    );
  }

  getSnapshot(context: FeatureFlagContext = {}): ResultAsync<FeatureFlagSnapshot, MongoFeatureFlagRepositoryError> {
    return this.listEnabled(context).map((flags) => ({
      source: 'mongodb',
      values: Object.fromEntries(flags.map((flag) => [flag.key, flag.value])),
    }));
  }

  upsert(
    input: MongoFeatureFlagUpsertInput,
    transactionContext?: unknown,
  ): ResultAsync<MongoFeatureFlag, MongoFeatureFlagRepositoryError> {
    return ResultAsync.fromPromise(this.upsertValidated(input, sessionFrom(transactionContext)), mapRepositoryError);
  }

  private async findValidated(
    key: string,
    tenantId: string,
    session?: ClientSession,
  ): Promise<MongoFeatureFlag | null> {
    assertKey(key);
    assertTenantId(tenantId);
    const document = await this.collection.findOne({ key, tenantId }, { session });
    return document === null ? null : toMongoFeatureFlag(document);
  }

  private async listValidated(tenantId: string, session?: ClientSession): Promise<MongoFeatureFlag[]> {
    assertTenantId(tenantId);
    const documents = await this.collection.find({ tenantId }, { session }).sort({ key: 1 }).toArray();
    return documents.map(toMongoFeatureFlag);
  }

  private async listEnabledValidated(tenantId: string): Promise<MongoFeatureFlag[]> {
    assertTenantId(tenantId);
    const documents = await this.collection.find({ enabled: true, tenantId }).sort({ key: 1 }).toArray();
    return documents.map(toMongoFeatureFlag);
  }

  private async upsertValidated(
    input: MongoFeatureFlagUpsertInput,
    session?: ClientSession,
  ): Promise<MongoFeatureFlag> {
    const tenantId = input.tenantId ?? DefaultFeatureFlagTenantId;
    const description = input.description ?? undefined;
    assertTenantId(tenantId);
    assertKey(input.key);
    assertValue(input.value);

    const now = new Date();
    const document = await this.collection.findOneAndUpdate(
      { tenantId, key: input.key },
      {
        $set: {
          value: input.value,
          updatedAt: now,
          ...(description !== undefined ? { description } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        },
        $setOnInsert: {
          _id: randomUUID(),
          tenantId,
          key: input.key,
          createdAt: now,
          ...(description === undefined ? { description: '' } : {}),
          ...(input.enabled === undefined ? { enabled: true } : {}),
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false, session },
    );

    if (document === null) {
      throw new Error('MongoDB feature flag upsert returned no document.');
    }
    return toMongoFeatureFlag(document);
  }
}

function sessionFrom(value: unknown): ClientSession | undefined {
  return typeof value === 'object' && value !== null && 'startTransaction' in value
    ? (value as ClientSession)
    : undefined;
}

export function resolveMongoFeatureFlagTenantId(context: FeatureFlagContext = {}): string {
  return context.tenantId ?? DefaultFeatureFlagTenantId;
}

function toMongoFeatureFlag(document: FeatureFlagDocument): MongoFeatureFlag {
  return {
    id: document._id,
    tenantId: document.tenantId,
    key: document.key,
    value: document.value,
    description: document.description,
    enabled: document.enabled,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function assertKey(key: string): void {
  if (key.length > 160 || !featureFlagKeyPattern.test(key)) {
    throw new Error('Feature flag keys must use at most 160 characters of dotted lowercase words.');
  }
}

function assertTenantId(tenantId: string): void {
  if (!tenantIdPattern.test(tenantId)) {
    throw new Error('Feature flag tenant IDs must be UUIDs.');
  }
}

function assertValue(value: FeatureFlagValue): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Feature flag numeric values must be finite.');
  }
}

function mapRepositoryError(cause: unknown): MongoFeatureFlagRepositoryError {
  return {
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Feature flag repository failed.',
  };
}
