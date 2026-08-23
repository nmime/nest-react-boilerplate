import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from '@app/backend-mongodb-main';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import { ResultAsync } from 'neverthrow';
import { PaymentsCollectionName } from './payments-mongo.collection';
import type { PaymentsDocument, PaymentsEntity, PaymentsRepositoryError } from './payments-mongo.types';

/**
 * Scaffold repository for the MongoDB payments axis.
 *
 * U4 reworks this into the documented no-transaction pattern for this axis: ordered writes
 * `receipt → event → payment` so a crash mid-way is recoverable by replay (the transition is
 * idempotent), with the shared `PaymentsPersistence` port bound to it.
 */
@Injectable()
export class PaymentsRepository {
  private readonly collection: Collection<PaymentsDocument>;

  constructor(
    @Inject(MongoDatabaseToken) database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {
    this.collection = database.collection<PaymentsDocument>(PaymentsCollectionName);
  }

  list(): ResultAsync<PaymentsEntity[], PaymentsRepositoryError> {
    return ResultAsync.fromPromise(
      this.collection
        .find()
        .sort({ createdAt: -1, _id: 1 })
        .toArray()
        .then((documents) => documents.map(toEntity)),
      mapRepositoryError,
    );
  }

  create(name: string): ResultAsync<PaymentsEntity, PaymentsRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistMany([name]).then((entities) => entities[0] as PaymentsEntity),
      mapRepositoryError,
    );
  }

  createMany(names: readonly string[]): ResultAsync<PaymentsEntity[], PaymentsRepositoryError> {
    return ResultAsync.fromPromise(this.persistMany(names), mapRepositoryError);
  }

  private async persistMany(names: readonly string[]): Promise<PaymentsEntity[]> {
    if (names.length === 0) {
      return [];
    }
    return runInMongoTransaction(this.client, async (session: ClientSession) => {
      const createdAt = new Date();
      const documents = names.map((name) => ({ _id: randomUUID(), name, createdAt }));
      await this.collection.insertMany(documents, { session });
      return documents.map(toEntity);
    });
  }
}

function toEntity(document: PaymentsDocument): PaymentsEntity {
  return { id: document._id, name: document.name, createdAt: document.createdAt };
}

function mapRepositoryError(): PaymentsRepositoryError {
  return { code: 'repository_error' };
}
