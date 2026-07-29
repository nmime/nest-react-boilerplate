import type { FastifySessionObject as Session } from '@fastify/session';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const end = vi.fn(() => Promise.resolve());
  const query = vi.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>(() => Promise.resolve({ rows: [] }));
  const pool = { end, query };
  return {
    end,
    pool,
    query,
    Pool: vi.fn(function PoolMock() {
      return pool;
    }),
  };
});

vi.mock('pg', () => ({ Pool: mocks.Pool }));

import { PostgresSessionStore } from './postgres-session.store';

const getSession = (store: PostgresSessionStore, sessionId: string) =>
  new Promise<{ error: unknown; session?: Session | null }>((resolve) => {
    store.get(sessionId, (error, session) => {
      resolve({ error, session });
    });
  });

const setSession = (store: PostgresSessionStore, sessionId: string, session: Session) =>
  new Promise<unknown>((resolve) => {
    store.set(sessionId, session, resolve);
  });

describe('PostgresSessionStore', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes, persists, reads, and destroys sessions through PostgreSQL', async () => {
    const store = new PostgresSessionStore('postgres://database/app', 3600, 60_000);
    await store.init();

    expect(mocks.Pool).toHaveBeenCalledWith({ connectionString: 'postgres://database/app' });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS fastify_sessions'));

    const expires = new Date(Date.now() + 60_000);
    await expect(
      setSession(store, 'session-id', { cookie: { expires }, user: 'ada' } as unknown as Session),
    ).resolves.toBeUndefined();
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO fastify_sessions'), [
      'session-id',
      { cookie: { expires: expires.toISOString() }, user: 'ada' },
      expires,
    ]);

    mocks.query.mockResolvedValueOnce({
      rows: [{ expire: expires, sess: { cookie: { expires: expires.toISOString() }, user: 'ada' } }],
    });
    const result = await getSession(store, 'session-id');
    expect(result.error).toBeNull();
    expect(result.session).toMatchObject({ user: 'ada' });
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
    expect(mocks.query).toHaveBeenCalledWith('DELETE FROM fastify_sessions WHERE sid = $1', ['session-id']);
    await store.close();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('removes expired sessions periodically and stops after close', async () => {
    vi.useFakeTimers();
    const store = new PostgresSessionStore('postgres://database/app', 3600, 1_000);
    await store.init();
    mocks.query.mockClear();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.query).toHaveBeenCalledWith('DELETE FROM fastify_sessions WHERE expire <= $1', [expect.any(Date)]);

    await store.close();
    mocks.query.mockClear();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('passes database errors to Fastify callbacks', async () => {
    const store = new PostgresSessionStore('postgres://database/app', 3600, 0);
    const failure = new Error('write failed');
    mocks.query.mockRejectedValueOnce(failure);

    await expect(setSession(store, 'session-id', { cookie: {} } as Session)).resolves.toBe(failure);
  });
});
