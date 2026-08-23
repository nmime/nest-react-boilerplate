// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
import { Migration20260823100000CreatePayments } from './Migration20260823100000CreatePayments';

describe('Migration20260823100000CreatePayments', () => {
  it('up() creates the scaffold payments table with the entity columns', () => {
    const migration = new Migration20260823100000CreatePayments(undefined as never, undefined as never);
    const sql: string[] = [];
    migration.addSql = (query: string) => {
      sql.push(query);
    };

    migration.up();

    const joined = sql.join('\n');
    expect(joined).toContain('create table');
    expect(joined).toContain('"payments"');
    expect(joined).toContain('"id"');
    expect(joined).toContain('"name"');
    expect(joined).toContain('"created_at"');
    expect(joined).toContain('primary key');
  });

  it('down() drops the scaffold table', () => {
    const migration = new Migration20260823100000CreatePayments(undefined as never, undefined as never);
    const sql: string[] = [];
    migration.addSql = (query: string) => {
      sql.push(query);
    };

    migration.up();
    migration.down();

    const joined = sql.join('\n');
    expect(joined).toContain('drop table');
    expect(joined).toContain('"payments"');
    expect(joined).toContain('cascade');
  });
});
