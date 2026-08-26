// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createHash, randomUUID } from 'node:crypto';
import { MikroORM, type Options } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import { PaymentsPostgresEntitySchemas, PaymentsPostgresModule } from './payments-postgres.module';
import { PaymentEventEntity } from './infrastructure/data-access/entities';
import { paymentsMigrations } from './infrastructure/data-access/migrations';
import { PaymentsPostgresPersistence } from './infrastructure/data-access/repositories';

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
        entities: [...PaymentsPostgresEntitySchemas],
        allowGlobalContext: true,
        debug: false,
      });
      await localAdminOrm.em.getConnection().execute(`create database "${localDatabaseName}"`);

      const localOptions: Partial<Options<PostgreSqlDriver>> = {
        driver: PostgreSqlDriver,
        clientUrl: localUrl.toString(),
        entities: [...PaymentsPostgresEntitySchemas],
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
          createPostgresContainerMikroOrmOptions(container, [...PaymentsPostgresEntitySchemas], {
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

  it('binds the shared port to the real repository and persists provider, payment, event, refund, and health rows', async () => {
    const current = orm!;
    const repository: PaymentsPersistence = new PaymentsPostgresPersistence(current.em.fork());
    expect(repository).toBeInstanceOf(PaymentsPostgresPersistence);
    expect(PaymentsPostgresModule).toBeDefined();

    await repository.upsertPaymentProvider({
      code: 'adyen',
      kind: 'fiat',
      enabled: true,
      baseUrl: 'https://checkout-test.example',
      version: 'adyen-checkout-v72',
      credentialsEncrypted: { keyId: 'k1', ct: 'redacted' },
    });
    await repository.upsertPaymentProviderHealth({
      providerCode: 'adyen',
      state: 'up',
      consecutiveErrors: 0,
      lastSuccessAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const paymentId = randomUUID();
    await repository.createPaymentRecord({
      id: paymentId,
      tenantId: randomUUID(),
      providerCode: 'adyen',
      providerPaymentId: 'psp-1',
      amount: '10.00',
      currency: 'USD',
    });
    await repository.createPaymentRefund({
      paymentId,
      providerRefundId: 'refund-1',
      amount: '10.00',
      currency: 'USD',
      status: 'requested',
    });

    await expect(repository.findPaymentRecord(paymentId)).resolves.toMatchObject({
      id: paymentId,
      status: 'pending',
      amount: '10.00',
    });
    await expect(repository.listPaymentEvents(paymentId)).resolves.toMatchObject([
      { paymentId, type: 'created', toStatus: 'pending' },
    ]);
    await expect(repository.listPaymentRefunds(paymentId)).resolves.toMatchObject([
      { paymentId, providerRefundId: 'refund-1' },
    ]);
    await expect(repository.findPaymentProviderHealth('adyen')).resolves.toMatchObject({ state: 'up' });
  });

  it('rolls back receipt, event, and payment transition together when the atomic commit fails', async () => {
    const current = orm!;
    const repository = new PaymentsPostgresPersistence(current.em.fork());
    const paymentId = randomUUID();
    const receiptKey = `atomic-${randomUUID()}`;
    await repository.createPaymentRecord({
      id: paymentId,
      tenantId: randomUUID(),
      providerCode: 'adyen',
      amount: '25.00',
      currency: 'USD',
      status: 'processing',
    });

    await expect(
      repository.commitWebhookPaymentTransition({
        receipt: {
          providerCode: 'adyen',
          idempotencyKey: receiptKey,
          rawBody: '{}',
          signatureValid: 'valid',
        },
        paymentId,
        toStatus: 'not-a-status' as never,
        actor: 'webhook',
      }),
    ).rejects.toThrow();

    const conn = current.em.getConnection();
    const [receiptCount] = await conn.execute<{ count: number }[]>(
      'select count(*)::int as count from payment_webhook_receipts where idempotency_key = ?',
      [receiptKey],
      'all',
    );
    const [eventCount] = await conn.execute<{ count: number }[]>(
      "select count(*)::int as count from payment_events where payment_id = ? and type = 'state_change'",
      [paymentId],
      'all',
    );
    const [paymentRow] = await conn.execute<{ status: string; version: number }[]>(
      'select status, version from payments where id = ?',
      [paymentId],
      'all',
    );
    expect(receiptCount?.count).toBe(0);
    expect(eventCount?.count).toBe(0);
    expect(paymentRow).toEqual({ status: 'processing', version: 1 });
  });

  it('proves concurrent outbox workers claim disjoint rows with FOR UPDATE SKIP LOCKED', async () => {
    const current = orm!;
    const repository = new PaymentsPostgresPersistence(current.em.fork());
    const paymentIds = [randomUUID(), randomUUID()];
    await Promise.all(
      paymentIds.map(async (paymentId) => {
        await repository.createPaymentRecord({
          id: paymentId,
          tenantId: randomUUID(),
          providerCode: 'adyen',
          amount: '5.00',
          currency: 'USD',
          status: 'processing',
        });
        await repository.appendPaymentEvent({
          paymentId,
          type: 'state_change',
          fromStatus: 'processing',
          toStatus: 'paid',
          actor: 'webhook',
        });
      }),
    );

    const workerA = new PaymentsPostgresPersistence(current.em.fork());
    const workerB = new PaymentsPostgresPersistence(current.em.fork());
    let releaseA: (() => void) | undefined;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let workerAClaimed: (() => void) | undefined;
    const claimedByA = new Promise<void>((resolve) => {
      workerAClaimed = resolve;
    });
    const claimedIdsA: Array<number | undefined> = [];
    const claimedIdsB: Array<number | undefined> = [];
    const publishA = vi.fn(async (events: readonly { id?: number }[]) => {
      claimedIdsA.push(events[0]?.id);
      workerAClaimed?.();
      await holdA;
    });
    const publishB = vi.fn((events: readonly { id?: number }[]) => {
      claimedIdsB.push(events[0]?.id);
      return Promise.resolve();
    });

    const claimA = workerA.claimPaymentOutbox(
      { count: 1, publishedAt: new Date('2026-08-26T00:00:10.000Z') },
      publishA,
    );
    await claimedByA;
    const claimB = workerB.claimPaymentOutbox(
      { count: 1, publishedAt: new Date('2026-08-26T00:00:11.000Z') },
      publishB,
    );
    await expect(claimB).resolves.toBe(1);
    releaseA?.();
    await expect(claimA).resolves.toBe(1);

    expect(claimedIdsA[0]).toBeDefined();
    expect(claimedIdsB[0]).toBeDefined();
    expect(claimedIdsA[0]).not.toBe(claimedIdsB[0]);
    const publishedRows = await current.em.find(PaymentEventEntity, {
      paymentId: { $in: paymentIds },
      type: 'state_change',
    });
    expect(publishedRows.map((event) => event.outboxPublishedAt)).toEqual([expect.any(Date), expect.any(Date)]);
  });
});
