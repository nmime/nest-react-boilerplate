import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DefaultAuthTenantId,
  type ProblemPresentationRecord,
  type ProblemPresentationRepositoryError,
  type ProblemPresentationRepositoryPort,
  type ResetProblemPresentationInput,
  type SaveProblemPresentationInput,
} from '@app/backend-feature-auth-shared';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import { ResultAsync } from 'neverthrow';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';
import { AuthMongoCollections } from './auth-mongo.collections';
import { collection, withoutId } from './auth-mongo.util';
import { makeAudit, makeOutbox, toDocument } from './auth-mongo-admin.repository';

class RevisionConflict extends Error {}
@Injectable()
export class MongoProblemPresentationRepository implements ProblemPresentationRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  list(tenantId = DefaultAuthTenantId): ResultAsync<ProblemPresentationRecord[], ProblemPresentationRepositoryError> {
    return mapped(
      collection(this.database, AuthMongoCollections.presentations)
        .find({ tenantId })
        .sort({ ruleId: 1 })
        .toArray()
        .then((items) => items.map((item) => withoutId(item) as ProblemPresentationRecord)),
    );
  }
  save(
    input: SaveProblemPresentationInput,
  ): ResultAsync<ProblemPresentationRecord, ProblemPresentationRepositoryError> {
    return mapped(runInMongoTransaction(this.client, (session) => this.persist(input, session)));
  }
  reset(input: ResetProblemPresentationInput): ResultAsync<boolean, ProblemPresentationRepositoryError> {
    return mapped(runInMongoTransaction(this.client, (session) => this.remove(input, session)));
  }
  private async persist(
    input: SaveProblemPresentationInput,
    session: ClientSession,
  ): Promise<ProblemPresentationRecord> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const now = new Date();
    const presentations = collection(this.database, AuthMongoCollections.presentations);
    let before: Record<string, unknown> = {};
    let record: ProblemPresentationRecord;
    if (input.expectedRevision === 0) {
      record = {
        id: randomUUID(),
        tenantId,
        ruleId: input.ruleId,
        display: input.display,
        severity: input.severity,
        comment: input.comment?.trim() ?? '',
        messageEn: input.messageEn?.trim() ?? '',
        messageRu: input.messageRu?.trim() ?? '',
        revision: 1,
        updatedByUserId: input.actorUserId,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await presentations.insertOne(toDocument(record), { session });
      } catch (error) {
        if (isDuplicate(error)) {
          throw new RevisionConflict();
        }
        throw error;
      }
    } else {
      const existing = await presentations.findOne(
        { tenantId, ruleId: input.ruleId, revision: input.expectedRevision },
        { session },
      );
      if (!existing) {
        throw new RevisionConflict();
      }
      before = snapshot(withoutId(existing) as ProblemPresentationRecord);
      const item = await presentations.findOneAndUpdate(
        { _id: existing._id, tenantId, revision: input.expectedRevision },
        {
          $set: {
            display: input.display,
            severity: input.severity,
            comment: input.comment?.trim() ?? '',
            messageEn: input.messageEn?.trim() ?? '',
            messageRu: input.messageRu?.trim() ?? '',
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
        { session, returnDocument: 'after', includeResultMetadata: false },
      );
      if (!item) {
        throw new RevisionConflict();
      }
      record = withoutId(item) as ProblemPresentationRecord;
    }
    const audit = makeAudit({
      tenantId,
      actorUserId: input.actorUserId,
      action: 'admin.problem_presentation.update',
      resource: 'admin.settings',
      before,
      after: snapshot(record),
      metadata: { ruleId: input.ruleId, ...(input.metadata ?? {}) },
    });
    const outbox = makeOutbox(audit, 'problem-presentation', audit.id);
    await collection(this.database, AuthMongoCollections.auditLogs).insertOne(toDocument(audit), { session });
    await collection(this.database, AuthMongoCollections.outbox).insertOne(toDocument(outbox), { session });
    return record;
  }
  private async remove(input: ResetProblemPresentationInput, session: ClientSession): Promise<boolean> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const item = await collection(this.database, AuthMongoCollections.presentations).findOneAndDelete(
      { tenantId, ruleId: input.ruleId, revision: input.expectedRevision },
      { session, includeResultMetadata: false },
    );
    if (!item) {
      const current = await collection(this.database, AuthMongoCollections.presentations).findOne(
        { tenantId, ruleId: input.ruleId },
        { session },
      );
      if (current || input.expectedRevision !== 0) {
        throw new RevisionConflict();
      }
      return false;
    }
    const record = withoutId(item) as ProblemPresentationRecord;
    const audit = makeAudit({
      tenantId,
      actorUserId: input.actorUserId,
      action: 'admin.problem_presentation.reset',
      resource: 'admin.settings',
      before: snapshot(record),
      after: {},
      metadata: { ruleId: input.ruleId, ...(input.metadata ?? {}) },
    });
    const outbox = makeOutbox(audit, 'problem-presentation', audit.id);
    await collection(this.database, AuthMongoCollections.auditLogs).insertOne(toDocument(audit), { session });
    await collection(this.database, AuthMongoCollections.outbox).insertOne(toDocument(outbox), { session });
    return true;
  }
}
const snapshot = (item: ProblemPresentationRecord): Record<string, unknown> => ({
  ruleId: item.ruleId,
  display: item.display,
  severity: item.severity,
  comment: item.comment,
  messageEn: item.messageEn,
  messageRu: item.messageRu,
  revision: item.revision,
});
const mapped = <T>(promise: Promise<T>): ResultAsync<T, ProblemPresentationRepositoryError> =>
  ResultAsync.fromPromise(promise, (error) =>
    error instanceof RevisionConflict
      ? {
          code: 'revision_conflict',
          message: 'The problem presentation changed after it was loaded. Refresh and try again.',
        }
      : {
          code: 'repository_error',
          message: error instanceof Error ? error.message : 'Problem presentation repository failed.',
        },
  );
const isDuplicate = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
