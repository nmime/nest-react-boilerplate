import type { FastifySessionObject as Session } from '@fastify/session';
import { Pool, type PoolClient } from 'pg';
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

export class PostgresSessionStore implements BackendSessionStore {
  private initialized: Promise<void> | undefined;
  private sweepTimer: NodeJS.Timeout | undefined;
  private readonly pool: Pool;

  constructor(
    databaseUrl: string,
    private readonly defaultMaxAgeSeconds: number,
    private readonly sweepIntervalMs: number,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.ensureInitialized();
    this.startExpiredSessionSweep();
  }

  async close(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    await this.pool.end();
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

  private ensureInitialized(): Promise<void> {
    this.initialized ??= this.createTable(this.pool);
    return this.initialized;
  }

  private startExpiredSessionSweep(): void {
    if (this.sweepTimer || this.sweepIntervalMs <= 0) {
      return;
    }
    this.sweepTimer = setInterval(() => void this.deleteExpiredSessions(), this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  private async createTable(client: Pool | PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fastify_sessions (
        sid varchar PRIMARY KEY,
        sess jsonb NOT NULL,
        expire timestamptz NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS ix__fastify_sessions__expire
      ON fastify_sessions (expire)
    `);
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ sess: Session; expire: Date }>(
      'SELECT sess, expire FROM fastify_sessions WHERE sid = $1',
      [sessionId],
    );
    const row = result.rows.at(0);
    if (!row) {
      return null;
    }
    const expiresAt = row.expire instanceof Date ? row.expire : new Date(row.expire);
    if (expiresAt.getTime() <= Date.now()) {
      await this.deleteSession(sessionId);
      return null;
    }
    return reviveSession(row.sess);
  }

  private async setSession(sessionId: string, session: Session): Promise<void> {
    await this.ensureInitialized();
    await this.pool.query(
      `
        INSERT INTO fastify_sessions (sid, sess, expire)
        VALUES ($1, $2, $3)
        ON CONFLICT (sid)
        DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire
      `,
      [sessionId, serializeSession(session), resolveSessionExpiry(session, this.defaultMaxAgeSeconds)],
    );
  }

  private async deleteExpiredSessions(): Promise<void> {
    await this.pool.query('DELETE FROM fastify_sessions WHERE expire <= $1', [new Date()]);
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.pool.query('DELETE FROM fastify_sessions WHERE sid = $1', [sessionId]);
  }
}
