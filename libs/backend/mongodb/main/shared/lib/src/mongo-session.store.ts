import type { FastifySessionObject as Session } from '@fastify/session';
import { MongoClient, type Collection } from 'mongodb';
import ConnectionString from 'mongodb-connection-string-url';
import {
  completeSessionGet,
  completeSessionMutation,
  resolveSessionExpiry,
  reviveSession,
  serializeSession,
  type BackendSessionStore,
  type SessionStoreCallback,
  type SessionStoreGetCallback,
} from '@app/backend-common-bootstrap';
import { createMongoClientOptions, MongoDatabaseConfigService } from './mongo.config';

interface MongoSessionDocument {
  expire: Date;
  sess: Session;
  sid: string;
}

export class MongoSessionStore implements BackendSessionStore {
  private readonly client: MongoClient;
  private readonly collection: Collection<MongoSessionDocument>;

  constructor(
    env: NodeJS.ProcessEnv,
    private readonly defaultMaxAgeSeconds: number,
  ) {
    const config = new MongoDatabaseConfigService(env);
    assertMongoSessionUri(config.uri, config.replicaSet);
    this.client = new MongoClient(config.uri, createMongoClientOptions(config));
    this.collection = this.client.db(config.database).collection<MongoSessionDocument>('fastify_sessions');
  }

  async init(): Promise<void> {
    await this.client.connect();
    await verifyMongoSessionIndexes(this.collection);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  get(sessionId: string, callback: SessionStoreGetCallback): void {
    completeSessionGet(this.getSession(sessionId), callback);
  }

  set(sessionId: string, session: Session, callback: SessionStoreCallback): void {
    completeSessionMutation(this.setSession(sessionId, session), callback);
  }

  destroy(sessionId: string, callback: SessionStoreCallback): void {
    completeSessionMutation(this.deleteSession(sessionId), callback);
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    const row = await this.collection.findOne({ sid: sessionId });
    if (!row) {
      return null;
    }
    if (row.expire.getTime() <= Date.now()) {
      await this.deleteSession(sessionId);
      return null;
    }
    return reviveSession(row.sess);
  }

  private async setSession(sessionId: string, session: Session): Promise<void> {
    await this.collection.updateOne(
      { sid: sessionId },
      {
        $set: {
          expire: resolveSessionExpiry(session, this.defaultMaxAgeSeconds),
          sess: serializeSession(session),
          sid: sessionId,
        },
      },
      { upsert: true },
    );
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.collection.deleteOne({ sid: sessionId });
  }
}

function assertMongoSessionUri(uri: string, expectedReplicaSet: string | undefined): void {
  let parsed: ConnectionString;
  try {
    parsed = new ConnectionString(uri);
  } catch {
    throw new Error('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI.');
  }
  const uriReplicaSet = parsed.searchParams.get('replicaSet')?.trim();
  if (uriReplicaSet && expectedReplicaSet && uriReplicaSet !== expectedReplicaSet) {
    throw new Error('MongoDB replica-set configuration must use one consistent replica-set name.');
  }
  if (!uriReplicaSet && !expectedReplicaSet) {
    throw new Error('MongoDB replicaSet configuration is required for server-side sessions.');
  }
}

async function verifyMongoSessionIndexes(collection: Collection<MongoSessionDocument>): Promise<void> {
  let indexes: unknown;
  try {
    indexes = await collection.listIndexes().toArray();
  } catch {
    throw new Error('MongoDB session migration is not applied.');
  }
  if (
    !Array.isArray(indexes) ||
    !indexes.some((index) => matchesMongoIndex(index, 'ux__fastify_sessions__sid', 'sid', true)) ||
    !indexes.some((index) => matchesMongoIndex(index, 'ix__fastify_sessions__expire', 'expire', undefined, 0))
  ) {
    throw new Error('MongoDB session migration is not applied.');
  }
}

function matchesMongoIndex(
  value: unknown,
  name: string,
  key: string,
  unique?: boolean,
  expireAfterSeconds?: number,
): boolean {
  if (!isRecord(value) || !isRecord(value.key)) {
    return false;
  }
  return (
    value.name === name &&
    value.key[key] === 1 &&
    (unique === undefined || value.unique === unique) &&
    (expireAfterSeconds === undefined || value.expireAfterSeconds === expireAfterSeconds)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
