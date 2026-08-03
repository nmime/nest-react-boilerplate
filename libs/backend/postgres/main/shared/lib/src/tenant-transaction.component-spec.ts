// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/core';
import { type EntityManager, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import {
  TenantAppRole,
  tenantAppRoleUpSql,
  tenantRowLevelSecurityUpSql,
  withSystemContext,
  withTenantTransaction,
} from './tenant-transaction';

/**
 * Proves tenant isolation is enforced by Postgres, not by application
 * convention. A passing repository unit test cannot show this: it would pass just
 * as happily with the policies absent.
 */
const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write('Tenant RLS component test: skipped because Docker is not available on this host.\n');
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const table = 'tenant_isolation_probe';

describeIfDocker('tenant row-level security', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver>;
  let em: EntityManager;

  beforeAll(async () => {
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>({
      ...createPostgresContainerMikroOrmOptions(container),
      driver: PostgreSqlDriver,
      discovery: { warnWhenNoEntities: false },
    });
    em = orm.em;

    // A table with the same shape as a real tenant-scoped one, then the EXACT
    // statements the migrations emit — via the shared builders, so this proves the
    // production SQL rather than a copy of it that could drift.
    await em.getConnection().execute(`create table "${table}" ("id" uuid primary key, "tenant_id" uuid not null)`);
    /* eslint-disable no-await-in-loop -- schema setup statements must apply in order */
    for (const statement of [...tenantAppRoleUpSql(), ...tenantRowLevelSecurityUpSql(table)]) {
      await em.getConnection().execute(statement);
    }
    /* eslint-enable no-await-in-loop */
    // The connecting user must be able to assume the restricted role.
    await em.getConnection().execute(`grant "${TenantAppRole}" to current_user`);
  }, 180_000);

  afterAll(async () => {
    await orm.close(true);
    await stopPostgresContainer(container);
  });

  beforeEach(async () => {
    // Seeded outside any tenant scope, as the owner, so both tenants have rows.
    await em.getConnection().execute(`delete from "${table}"`);
    await em
      .getConnection()
      .execute(`insert into "${table}" ("id", "tenant_id") values (?, ?), (?, ?)`, [
        randomUUID(),
        tenantA,
        randomUUID(),
        tenantB,
      ]);
  });

  const countWithin = async (tenantId: string): Promise<number> =>
    withTenantTransaction(em, tenantId, async (scoped) => {
      const rows = await scoped
        .getConnection()
        .execute<{ total: string }[]>(
          `select count(*)::text as total from "${table}"`,
          [],
          'all',
          scoped.getTransactionContext(),
        );
      return Number(rows[0]?.total ?? '-1');
    });

  it('shows a tenant only its own rows', async () => {
    expect(await countWithin(tenantA)).toBe(1);
    expect(await countWithin(tenantB)).toBe(1);
  });

  it('refuses to write a row belonging to another tenant', async () => {
    await expect(
      withTenantTransaction(em, tenantA, async (scoped) =>
        scoped
          .getConnection()
          .execute(
            `insert into "${table}" ("id", "tenant_id") values (?, ?)`,
            [randomUUID(), tenantB],
            'run',
            scoped.getTransactionContext(),
          ),
      ),
    ).rejects.toThrow(/row-level security/iu);
  });

  it('cannot update or delete across tenants', async () => {
    const updated = await withTenantTransaction(em, tenantA, async (scoped) =>
      scoped
        .getConnection()
        .execute<{ id: string }[]>(
          `update "${table}" set "tenant_id" = "tenant_id" where "tenant_id" = ? returning "id"`,
          [tenantB],
          'all',
          scoped.getTransactionContext(),
        ),
    );
    expect(updated).toHaveLength(0);

    const deleted = await withTenantTransaction(em, tenantA, async (scoped) =>
      scoped
        .getConnection()
        .execute<{ id: string }[]>(
          `delete from "${table}" where "tenant_id" = ? returning "id"`,
          [tenantB],
          'all',
          scoped.getTransactionContext(),
        ),
    );
    expect(deleted).toHaveLength(0);
  });

  it('returns nothing when no tenant is set, rather than everything', async () => {
    // Fail-closed: `nullif(..., '')::uuid` is NULL and `tenant_id = NULL` matches
    // no row. This is why the ambient scope must refuse a tenant-less request —
    // otherwise the caller sees an empty result instead of an error.
    const rows = await em.transactional(async (tx) => {
      const context: unknown = tx.getTransactionContext();
      await tx.getConnection().execute(`set local role "${TenantAppRole}"`, [], 'run', context);
      return tx
        .getConnection()
        .execute<{ total: string }[]>(`select count(*)::text as total from "${table}"`, [], 'all', context);
    });

    expect(Number(rows[0]?.total)).toBe(0);
  });

  it('proves the restricted role cannot bypass row-level security', async () => {
    // Guards against a future migration granting BYPASSRLS, which would disable
    // every policy while leaving them visibly in place.
    const rows = await em
      .getConnection()
      .execute<{ rolbypassrls: boolean }[]>(`select rolbypassrls from pg_roles where rolname = ?`, [TenantAppRole]);

    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('leaks across tenants when raw SQL is not given the transaction context', async () => {
    // The trap this seam exists to close. Without the context the statement
    // borrows another pooled connection where `SET LOCAL` never applied, so it
    // runs as the owner with policies bypassed and sees BOTH tenants. A naive
    // implementation looks correct until a hand-written query appears.
    const leaked = await withTenantTransaction(em, tenantA, async (scoped) =>
      scoped.getConnection().execute<{ total: string }[]>(`select count(*)::text as total from "${table}"`),
    );

    expect(Number(leaked[0]?.total)).toBe(2);
  });

  it('runs system work without a tenant scope', async () => {
    const rows = await withSystemContext(em, async (system) =>
      system.getConnection().execute<{ total: string }[]>(`select count(*)::text as total from "${table}"`),
    );

    expect(Number(rows[0]?.total)).toBe(2);
  });
});
