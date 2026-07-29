import type { FastifySessionObject as Session } from '@fastify/session';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const close = vi.fn(() => Promise.resolve());
  const connect = vi.fn(() => Promise.resolve());
  const deleteOne = vi.fn(() => Promise.resolve({ deletedCount: 1 }));
  const findOne = vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve(null));
  const listIndexes = vi.fn(() => ({
    toArray: () =>
      Promise.resolve([
        { name: 'ux__fastify_sessions__sid', key: { sid: 1 }, unique: true },
        { name: 'ix__fastify_sessions__expire', key: { expire: 1 }, expireAfterSeconds: 0 },
      ]),
  }));
  const updateOne = vi.fn(() => Promise.resolve({ modifiedCount: 1 }));
  const collection = { deleteOne, findOne, listIndexes, updateOne };
  const database = { collection: vi.fn(() => collection) };
  const client = { close, connect, db: vi.fn(() => database) };
  return {
    client,
    close,
    collection,
    connect,
    database,
    deleteOne,
    findOne,
    listIndexes,
    updateOne,
    MongoClient: vi.fn(function MongoClientMock() {
      return client;
    }),
  };
});

vi.mock('mongodb', () => ({ MongoClient: mocks.MongoClient }));

import { MongoSessionStore } from './mongo-session.store';

const environment = {
  MONGODB_DATABASE: 'app',
  MONGODB_REPLICA_SET: 'rs0',
  MONGODB_URI: 'mongodb://mongo-a,mongo-b/app',
};

const getSession = (store: MongoSessionStore, sessionId: string) =>
  new Promise<{ error: unknown; session?: Session | null }>((resolve) => {
    store.get(sessionId, (error, session) => {
      resolve({ error, session });
    });
  });

const setSession = (store: MongoSessionStore, sessionId: string, session: Session) =>
  new Promise<unknown>((resolve) => {
    store.set(sessionId, session, resolve);
  });

describe('MongoSessionStore', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('verifies indexes and atomically persists, reads, and destroys sessions', async () => {
    const store = new MongoSessionStore(environment, 3600);
    await store.init();

    expect(mocks.MongoClient).toHaveBeenCalledWith(
      environment.MONGODB_URI,
      expect.objectContaining({ replicaSet: 'rs0', retryWrites: true, writeConcern: { w: 'majority' } }),
    );
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.listIndexes).toHaveBeenCalledOnce();

    const expires = new Date(Date.now() + 60_000);
    await expect(
      setSession(store, 'session-id', { cookie: { expires }, user: 'grace' } as unknown as Session),
    ).resolves.toBeUndefined();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { sid: 'session-id' },
      {
        $set: {
          expire: expires,
          sess: { cookie: { expires: expires.toISOString() }, user: 'grace' },
          sid: 'session-id',
        },
      },
      { upsert: true },
    );

    mocks.findOne.mockResolvedValueOnce({
      expire: expires,
      sess: { cookie: { expires: expires.toISOString() }, user: 'grace' },
      sid: 'session-id',
    });
    const result = await getSession(store, 'session-id');
    expect(result.error).toBeNull();
    expect(result.session).toMatchObject({ user: 'grace' });
    expect(result.session?.cookie.expires).toBeInstanceOf(Date);

    await new Promise<void>((resolve, reject) => {
      store.destroy('session-id', (error) => {
        if (error) {
          reject(error instanceof Error ? error : new Error('Session callback failed.', { cause: error }));
          return;
        }
        resolve();
      });
    });
    expect(mocks.deleteOne).toHaveBeenCalledWith({ sid: 'session-id' });
    await store.close();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('deletes expired sessions and forwards driver failures', async () => {
    const store = new MongoSessionStore(environment, 3600);
    mocks.findOne.mockResolvedValueOnce({ expire: new Date(Date.now() - 1), sess: { cookie: {} }, sid: 'expired' });
    await expect(getSession(store, 'expired')).resolves.toEqual({ error: null, session: null });
    expect(mocks.deleteOne).toHaveBeenCalledWith({ sid: 'expired' });

    const failure = new Error('write failed');
    mocks.updateOne.mockRejectedValueOnce(failure);
    await expect(setSession(store, 'session-id', { cookie: {} } as Session)).resolves.toBe(failure);
  });

  it('fails closed when the session indexes are not applied', async () => {
    mocks.listIndexes.mockReturnValueOnce({ toArray: () => Promise.resolve([]) });
    const store = new MongoSessionStore(environment, 3600);

    await expect(store.init()).rejects.toThrow('MongoDB session migration is not applied.');
  });
});
