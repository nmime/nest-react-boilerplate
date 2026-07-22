import { Migration } from '@mikro-orm/migrations';

/** Creates the single server-side application session store used by every API. */
export class Migration20260722092000CreateCanonicalSessions extends Migration {
  override up(): void {
    this.addSql(`
      create table if not exists "fastify_sessions" (
        "sid" varchar primary key,
        "sess" jsonb not null,
        "expire" timestamptz not null
      );
    `);
    this.addSql('drop index if exists "fastify_sessions_expire_idx";');
    this.addSql('create index if not exists "ix__fastify_sessions__expire" on "fastify_sessions" ("expire");');
  }

  override down(): void {
    this.addSql('drop table if exists "fastify_sessions";');
  }
}
