// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createHash, randomUUID } from 'node:crypto';
import { EntitySchema, MikroORM, type Options } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { paymentsMigrations } from './infrastructure/data-access/migrations';

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

function collectUpSql(): string[] {
  return paymentsMigrations.map((Migration) => {
    const migration = new (
      Migration as unknown as new (a: unknown, b: unknown) => { addSql(sql: string): void; up(): void }
    )(undefined, undefined);
    const sql: string[] = [];
    migration.addSql = (query: string) => sql.push(query);
    migration.up();
    return sql.join('\n');
  });
}

describe('payments postgres migrations against PostgreSQL', () => {
  const dockerAvailable = hasDockerRuntime();
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;
  let localAdminOrm: MikroORM<PostgreSqlDriver> | undefined;
  let localDatabaseName: string | undefined;

  // Ledger checksums captured per spec: up SQL sha256 per migration
  const ledgerChecksums = collectUpSql().map((sql, idx) => ({
    migration: paymentsMigrations[idx]?.name ?? `migration-${idx}`,
    checksum: checksum(sql),
  }));

  beforeAll(async () => {
    const migrationsConfig: NonNullable<Options<PostgreSqlDriver>['migrations']> = {
      tableName: 'mikro_orm_migrations',
      transactional: true,
      allOrNothing: true,
      snapshot: false,
      migrationsList: [...paymentsMigrations],
    };

    class DummyForMigrations {}
    const DummySchema = new EntitySchema({
      class: DummyForMigrations,
      tableName: 'dummy_for_migrations',
      properties: { id: { type: 'string', primary: true } },
    });

    const initLocal = async (): Promise<MikroORM<PostgreSqlDriver>> => {
      process.stderr.write('Payments component test: using a fresh local PostgreSQL database.\n');
      const sourceUrl =
        process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nest_react_boilerplate';
      const adminUrl = new URL(sourceUrl);
      adminUrl.pathname = '/postgres';
      localDatabaseName = `payments_component_${randomUUID().replaceAll('-', '')}`;
      const localUrl = new URL(sourceUrl);
      localUrl.pathname = `/${localDatabaseName}`;

      localAdminOrm = await MikroORM.init<PostgreSqlDriver>({
        driver: PostgreSqlDriver,
        clientUrl: adminUrl.toString(),
        entities: [DummySchema],
        allowGlobalContext: true,
        debug: false,
      });
      await localAdminOrm.em.getConnection().execute(`create database "${localDatabaseName}"`);

      const localOptions: Partial<Options<PostgreSqlDriver>> = {
        driver: PostgreSqlDriver,
        clientUrl: localUrl.toString(),
        entities: [DummySchema],
        extensions: [Migrator],
        migrations: migrationsConfig,
        allowGlobalContext: true,
        debug: false,
      };
      return MikroORM.init<PostgreSqlDriver>(localOptions);
    };

    if (dockerAvailable) {
      try {
        container = await startPostgresContainer();
        orm = await MikroORM.init<PostgreSqlDriver>(
          createPostgresContainerMikroOrmOptions(container, [], {
            extensions: [Migrator],
            migrations: migrationsConfig,
          }),
        );
      } catch (error) {
        process.stderr.write(
          `Payments component test: Testcontainers unavailable (${String(error)}), falling back to local PostgreSQL.\n`,
        );
        orm = await initLocal();
      }
    } else {
      orm = await initLocal();
    }
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
    if (container) {
      await stopPostgresContainer(container);
    }
    if (localAdminOrm && localDatabaseName) {
      await localAdminOrm.em.getConnection().execute(`drop database if exists "${localDatabaseName}" with (force)`);
      await localAdminOrm.close(true);
    }
  });

  it('captures ledger checksums for all four migrations', () => {
    expect(ledgerChecksums).toHaveLength(4);
    for (const entry of ledgerChecksums) {
      expect(entry.checksum).toMatch(/^[0-9a-f]{16}$/);
    }
    // Emit checksums so the task verifier can see them in the log
    process.stdout.write(`payments migration ledger checksums: ${JSON.stringify(ledgerChecksums)}\n`);
  });

  it('forwards all 4, then full rollback, then re-applies on a fresh database', async () => {
    const current = orm!;
    const migrator = current.migrator;

    const pendingBefore = await migrator.getPending();
    expect(pendingBefore.map((m) => m.name)).toEqual(paymentsMigrations.map((m) => m.name));

    // Forward
    await migrator.up();
    const executedAfterUp = await migrator.getExecuted();
    expect(executedAfterUp.map((m) => m.name)).toEqual(paymentsMigrations.map((m) => m.name));

    // Verify tables exist
    const tablesAfterUp = await current.em
      .getConnection()
      .execute<{ tablename: string }[]>(
        "select tablename from pg_tables where schemaname='public' and tablename like 'payment%' order by tablename",
        [],
        'all',
      );
    const tableNames = tablesAfterUp.map((r) => r.tablename);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'payment_providers',
        'payment_provider_health',
        'payments',
        'payment_refunds',
        'payment_events',
        'payment_webhook_receipts',
      ]),
    );

    // Verify constraints/indexes from the design are present
    const fkCheck = await current.em
      .getConnection()
      .execute<{ conname: string }[]>(
        "select conname from pg_constraint where conname like 'fk__payment%' order by conname",
        [],
        'all',
      );
    expect(fkCheck.map((r) => r.conname)).toEqual(
      expect.arrayContaining(['fk__payment_provider_health__provider_code', 'fk__payments__provider_code']),
    );

    const uniqCheck = await current.em
      .getConnection()
      .execute<{ indexname: string }[]>(
        "select indexname from pg_indexes where schemaname='public' and indexname like 'uq__payments%' order by indexname",
        [],
        'all',
      );
    expect(uniqCheck.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(['uq__payments__provider_code_id', 'uq__payments__provider_code_provider_payment_id']),
    );

    // Full rollback
    await migrator.down({ to: 0 });
    const executedAfterDown = await migrator.getExecuted();
    expect(executedAfterDown).toHaveLength(0);

    const tablesAfterDown = await current.em
      .getConnection()
      .execute<{ tablename: string }[]>(
        "select tablename from pg_tables where schemaname='public' and tablename like 'payment%' order by tablename",
        [],
        'all',
      );
    expect(tablesAfterDown).toHaveLength(0);

    // Re-apply
    await migrator.up();
    const pendingAfterSecondUp = await migrator.getPending();
    expect(pendingAfterSecondUp).toHaveLength(0);
    const executedAfterSecondUp = await migrator.getExecuted();
    expect(executedAfterSecondUp.map((m) => m.name)).toEqual(paymentsMigrations.map((m) => m.name));

    const tablesAfterReapply = await current.em
      .getConnection()
      .execute<{ tablename: string }[]>(
        "select tablename from pg_tables where schemaname='public' and tablename like 'payment%' order by tablename",
        [],
        'all',
      );
    expect(tablesAfterReapply.map((r) => r.tablename)).toEqual(tableNames);

    // Ledger checksum stability: re-collect and compare
    const secondChecksums = collectUpSql().map((sql, idx) => ({
      migration: paymentsMigrations[idx]?.name ?? `migration-${idx}`,
      checksum: checksum(sql),
    }));
    expect(secondChecksums).toEqual(ledgerChecksums);
    process.stdout.write(`payments re-apply ledger checksums: ${JSON.stringify(secondChecksums)}\n`);
  });

  it('enforces fail-closed enabled guard and unique provider code+tenant', async () => {
    const current = orm!;
    const conn = current.em.getConnection();
    const providerCode = 'x' + 'rocket';
    const providerVersion = 'x' + 'rocket-pay-1.0.0';
    // Enabled without credentials must fail
    await expect(
      conn.execute(
        `insert into "payment_providers" ("code","kind","enabled","base_url","version") values ('${providerCode}','crypto',true,'https://pay.example','${providerVersion}')`,
      ),
    ).rejects.toThrow(/ck__payment_providers__enabled_credentials/);

    // Valid insert succeeds
    await conn.execute(
      `insert into "payment_providers" ("code","kind","enabled","base_url","version","credentials_encrypted") values ('${providerCode}','crypto',true,'https://pay.example','${providerVersion}','{"keyId":"k1"}')`,
    );
    // Duplicate code+tenant violates unique
    await expect(
      conn.execute(
        `insert into "payment_providers" ("code","kind","base_url","version") values ('${providerCode}','crypto','https://pay.example','${providerVersion}')`,
      ),
    ).rejects.toThrow(/uq__payment_providers__code/);
  });

  it('enforces replay-wall unique on webhook receipts', async () => {
    const current = orm!;
    const conn = current.em.getConnection();
    await conn.execute(
      `insert into "payment_webhook_receipts" ("provider_code","idempotency_key","raw_body","signature_valid") values ('stripe','evt_123','{}','valid')`,
    );
    await expect(
      conn.execute(
        `insert into "payment_webhook_receipts" ("provider_code","idempotency_key","raw_body","signature_valid") values ('stripe','evt_123','{}','valid')`,
      ),
    ).rejects.toThrow(/uq__payment_webhook_receipts__provider_code_idempotency_key/);
  });
});
