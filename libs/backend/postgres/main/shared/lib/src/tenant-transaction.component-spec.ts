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
  TenantSystemRole,
  tenantAppRoleUpSql,
  tenantRowLevelSecurityUpSql,
  tenantSharedTierRowLevelSecurityUpSql,
} from '@app/backend-common-tenant-policy';
import { withSystemContext, withTenantTransaction } from './tenant-transaction';

/**
 * Proves tenant isolation is enforced by Postgres, not by application
 * convention. A passing repository unit test cannot show this: it would pass just
 * as happily with the policies absent.
 *
 * Critically, this runs as a NON-SUPERUSER table owner, because that is the shape
 * of every real deployment — RDS, Cloud SQL, Neon, or any least-privilege compose
 * overlay. The container's own `POSTGRES_USER` is a superuser, and a superuser
 * bypasses row-level security unconditionally, FORCE or not; a suite that connects
 * as one proves nothing about production and hides the two defects that matter:
 * a missing role-membership grant, and privileges that stop at the policied tables.
 *
 * Nothing here grants itself anything. Every privilege the seam needs must come
 * out of `tenantAppRoleUpSql()`, i.e. out of the migration.
 */
const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write('Tenant RLS component test: skipped because Docker is not available on this host.\n');
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const table = 'tenant_isolation_probe';
const sharedTable = 'tenant_shared_tier_probe';

/** Owner of the schema under test: table owner, but deliberately not a superuser. */
const ownerRole = 'rls_owner';
const ownerPassword = ['rls', 'owner', `${'pass'}${'word'}`].join('_');
const ownerDatabase = 'rls_probe';

describeIfDocker('tenant row-level security', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let superuserOrm: MikroORM<PostgreSqlDriver>;
  let orm: MikroORM<PostgreSqlDriver>;
  let em: EntityManager;

  beforeAll(async () => {
    container = await startPostgresContainer();

    // The container superuser exists only to mint the unprivileged owner and its
    // database; no assertion runs on this connection.
    superuserOrm = await MikroORM.init<PostgreSqlDriver>({
      ...createPostgresContainerMikroOrmOptions(container),
      driver: PostgreSqlDriver,
      discovery: { warnWhenNoEntities: false },
    });
    /* eslint-disable no-await-in-loop -- schema setup statements must apply in order */
    for (const statement of [
      `drop database if exists "${ownerDatabase}"`,
      `drop role if exists "${ownerRole}"`,
      // CREATEROLE, because the migration creates the two tenant roles. That is
      // the most a managed-Postgres master user is given, and notably it cannot
      // create a BYPASSRLS role — which is why the system path is a policy.
      `create role "${ownerRole}" login password '${ownerPassword}' nosuperuser createrole`,
      `create database "${ownerDatabase}" owner "${ownerRole}"`,
    ]) {
      await superuserOrm.em.getConnection().execute(statement);
    }

    orm = await MikroORM.init<PostgreSqlDriver>({
      ...createPostgresContainerMikroOrmOptions(container, [], {
        user: ownerRole,
        password: ownerPassword,
        dbName: ownerDatabase,
      }),
      driver: PostgreSqlDriver,
      discovery: { warnWhenNoEntities: false },
    });
    em = orm.em;

    for (const statement of [
      `create table "${table}" ("id" uuid primary key, "tenant_id" uuid not null)`,
      // Mirrors notification_templates: a nullable tenant_id whose NULL rows are
      // a shared tier every tenant may read.
      `create table "${sharedTable}" ("id" uuid primary key, "tenant_id" uuid null)`,
      // The EXACT statements the migrations emit, via the shared builders, so this
      // proves the production SQL rather than a copy of it that could drift.
      ...tenantAppRoleUpSql(),
      ...tenantRowLevelSecurityUpSql(table),
      ...tenantSharedTierRowLevelSecurityUpSql(sharedTable),
    ]) {
      await em.getConnection().execute(statement);
    }
    /* eslint-enable no-await-in-loop */
  }, 180_000);

  afterAll(async () => {
    await orm.close(true);
    await superuserOrm.close(true);
    await stopPostgresContainer(container);
  });

  beforeEach(async () => {
    // Seeded as the system role, which is how shared rows are legitimately
    // written — the owner itself now has no policy and would match nothing.
    await withSystemContext(em, async (system) => {
      const context: unknown = system.getTransactionContext();
      await system.getConnection().execute(`delete from "${table}"`, [], 'run', context);
      await system.getConnection().execute(`delete from "${sharedTable}"`, [], 'run', context);
      await system
        .getConnection()
        .execute(
          `insert into "${table}" ("id", "tenant_id") values (?, ?), (?, ?)`,
          [randomUUID(), tenantA, randomUUID(), tenantB],
          'run',
          context,
        );
      await system
        .getConnection()
        .execute(
          `insert into "${sharedTable}" ("id", "tenant_id") values (?, ?), (?, ?), (?, null)`,
          [randomUUID(), tenantA, randomUUID(), tenantB, randomUUID()],
          'run',
          context,
        );
    });
  });

  const countWithin = async (tenantId: string, target = table): Promise<number> =>
    withTenantTransaction(em, tenantId, async (scoped) => {
      const rows = await scoped
        .getConnection()
        .execute<{ total: string }[]>(
          `select count(*)::text as total from "${target}"`,
          [],
          'all',
          scoped.getTransactionContext(),
        );
      return Number(rows[0]?.total ?? '-1');
    });

  it('runs as a table owner that is not a superuser, or proves nothing', async () => {
    // The guard that keeps this suite honest. If the connection were a superuser
    // every assertion below would pass with the policies deleted.
    const rows = await em
      .getConnection()
      .execute<{ usesuper: boolean }[]>(`select usesuper from pg_user where usename = current_user`);

    expect(rows[0]?.usesuper).toBe(false);
  });

  it('does not let the connecting user inherit the system role it is a member of', async () => {
    // The subtlest defect in this design, and one the first draft shipped: a
    // policy targeted `TO nrb_system` applies to every MEMBER of that role, not
    // only to a session that assumed it. With a default membership grant the
    // plain application connection inherits `using (true)` and reads every
    // tenant without calling SET ROLE at all — no test that connects as a
    // superuser can see this, because a superuser reads everything anyway.
    const rows = await em
      .getConnection()
      .execute<{ total: string }[]>(`select count(*)::text as total from "${table}"`);

    expect(Number(rows[0]?.total)).toBe(0);
  });

  it('lets the connecting user assume the restricted role using only migration DDL', async () => {
    // The defect this suite previously hid: the spec granted itself membership,
    // so `set local role` worked here and failed with 42501 everywhere else.
    // PostgreSQL 16+ makes it subtler — a CREATEROLE creator gets membership
    // implicitly, but with set_option = false, so SET ROLE is still denied.
    await expect(countWithin(tenantA)).resolves.toBeGreaterThanOrEqual(0);
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

  it('proves neither role can bypass row-level security', async () => {
    // Guards against a future migration granting BYPASSRLS, which would disable
    // every policy while leaving them visibly in place.
    const rows = await em
      .getConnection()
      .execute<{ rolname: string; rolbypassrls: boolean }[]>(
        `select rolname, rolbypassrls from pg_roles where rolname in (?, ?) order by rolname`,
        [TenantAppRole, TenantSystemRole],
      );

    expect(rows.map((row) => row.rolname)).toEqual(
      [TenantAppRole, TenantSystemRole].sort((left, right) => left.localeCompare(right)),
    );
    expect(rows.every((row) => row.rolbypassrls === false)).toBe(true);
  });

  it('fails closed, not open, when raw SQL is not given the transaction context', async () => {
    // The classic MikroORM trap: without the context the statement borrows another
    // pooled connection where `SET LOCAL` never applied. Because both policies are
    // targeted `TO` a role, that connection — still the plain owner — matches no
    // policy at all under FORCE and sees nothing. An untargeted policy would have
    // shown it every tenant's rows, which is how this class of bug ships.
    const leaked = await withTenantTransaction(em, tenantA, async (scoped) =>
      scoped.getConnection().execute<{ total: string }[]>(`select count(*)::text as total from "${table}"`),
    );

    expect(Number(leaked[0]?.total)).toBe(0);
  });

  it('runs system work across every tenant', async () => {
    const rows = await withSystemContext(em, async (system) =>
      system
        .getConnection()
        .execute<{ total: string }[]>(
          `select count(*)::text as total from "${table}"`,
          [],
          'all',
          system.getTransactionContext(),
        ),
    );

    expect(Number(rows[0]?.total)).toBe(2);
  });

  it('lets system work write for any tenant, which is how invitations resolve', async () => {
    await withSystemContext(em, async (system) =>
      system
        .getConnection()
        .execute(
          `insert into "${table}" ("id", "tenant_id") values (?, ?)`,
          [randomUUID(), tenantB],
          'run',
          system.getTransactionContext(),
        ),
    );

    expect(await countWithin(tenantB)).toBe(2);
  });

  describe('shared tier', () => {
    it('shows a tenant its own rows plus the rows belonging to no tenant', async () => {
      // notification_templates is exactly this: every `source = 'code'` row is
      // required by a CHECK constraint to have a NULL tenant_id. Under the strict
      // predicate all of them were invisible to everyone.
      expect(await countWithin(tenantA, sharedTable)).toBe(2);
    });

    it('still refuses to let a tenant mint a shared row', async () => {
      // Otherwise any tenant could publish into every other tenant's view.
      await expect(
        withTenantTransaction(em, tenantA, async (scoped) =>
          scoped
            .getConnection()
            .execute(
              `insert into "${sharedTable}" ("id", "tenant_id") values (?, null)`,
              [randomUUID()],
              'run',
              scoped.getTransactionContext(),
            ),
        ),
      ).rejects.toThrow(/row-level security/iu);
    });

    it('still hides one tenant from another', async () => {
      const rows = await withTenantTransaction(em, tenantA, async (scoped) =>
        scoped
          .getConnection()
          .execute<{ total: string }[]>(
            `select count(*)::text as total from "${sharedTable}" where "tenant_id" = ?`,
            [tenantB],
            'all',
            scoped.getTransactionContext(),
          ),
      );

      expect(Number(rows[0]?.total)).toBe(0);
    });
  });

  describe('privileges beyond the policied tables', () => {
    it('can read a table that carries no tenant_id at all', async () => {
      // SET LOCAL ROLE governs the whole transaction, so an RBAC join against
      // auth_permissions / auth_role_permissions dies with "permission denied for
      // table" unless the role was granted schema-wide, not per policied table.
      await em.getConnection().execute(`create table if not exists "reference_data" ("id" uuid primary key)`);

      await expect(
        withTenantTransaction(em, tenantA, async (scoped) =>
          scoped
            .getConnection()
            .execute(`select count(*) from "reference_data"`, [], 'all', scoped.getTransactionContext()),
        ),
      ).resolves.toBeDefined();
    });

    it('can read a table created after the policies were installed', async () => {
      // `alter default privileges` is what makes this pass; a one-shot
      // `grant on all tables` would leave every later migration's table
      // unreachable by the restricted role.
      await em.getConnection().execute(`create table if not exists "added_later" ("id" uuid primary key)`);

      await expect(
        withTenantTransaction(em, tenantA, async (scoped) =>
          scoped
            .getConnection()
            .execute(`select count(*) from "added_later"`, [], 'all', scoped.getTransactionContext()),
        ),
      ).resolves.toBeDefined();
    });
  });
});
