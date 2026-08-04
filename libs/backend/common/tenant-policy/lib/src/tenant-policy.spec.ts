// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TenantAppRole,
  TenantContextGuc,
  TenantRegistryTable,
  TenantScopedTables,
  TenantScopedTablesByDomain,
  TenantSharedTierTables,
  TenantSystemRole,
  tenantAppRoleUpSql,
  tenantRegistryRowLevelSecurityDownSql,
  tenantRegistryRowLevelSecurityUpSql,
  tenantRowLevelSecurityDownSql,
  tenantRowLevelSecurityUpSql,
  tenantSharedTierRowLevelSecurityUpSql,
} from './tenant-policy';

// Scans the real Postgres entity sources from this leaf lib's location.
const postgresMainRoot = new URL('../../../../postgres/main/', import.meta.url).pathname;

/**
 * Every entity table under libs/backend/postgres/main declaring a `tenant_id`.
 *
 * Split per `new EntitySchema` block, not per file: `auth-tenant.entity.ts`
 * defines three tables and only two of them carry the column, so matching at file
 * level reported `auth_tenants` as tenant-scoped when its own `id` is the tenant.
 */
interface DiscoveredTable {
  readonly table: string;
  /**
   * A nullable `tenant_id` means the table has a shared tier: rows belonging to
   * no tenant that every tenant may still read. The strict predicate
   * (`tenant_id = <current>`) is NULL for those rows and therefore hides them
   * permanently, so they need the shared-tier policy instead.
   */
  readonly nullable: boolean;
}

function tenantScopedTablesInFile(path: string): DiscoveredTable[] {
  return readFileSync(path, 'utf8')
    .split(/(?=new EntitySchema)/u)
    .filter((block) => block.includes('tenant_id'))
    .flatMap((block) => {
      // Digits are allowed: a table named `auth_oauth2_clients` would otherwise
      // be silently skipped by the guard that exists to catch omissions.
      const table = /tableName:\s*'([a-z0-9_]+)'/u.exec(block)?.[1];
      if (table === undefined) {
        return [];
      }

      const declaration = /tenantId:\s*\{[^}]*\}/u.exec(block)?.[0] ?? '';
      return [{ table, nullable: /nullable:\s*true/u.test(declaration) }];
    });
}

function entityFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : entityFiles(path);
    }
    return entry.name.endsWith('.entity.ts') ? [path] : [];
  });
}

function discoverTenantScopedTables(): DiscoveredTable[] {
  const found = new Map(
    entityFiles(postgresMainRoot)
      .flatMap(tenantScopedTablesInFile)
      .map((it) => [it.table, it]),
  );
  return [...found.values()].sort((left, right) => left.table.localeCompare(right.table));
}

describe('TenantScopedTablesByDomain', () => {
  it('covers every entity table that carries a tenant_id', () => {
    // This is the guard that matters. A new tenant-scoped table left out of the
    // list gets no policy and leaks across tenants — and nothing else in the
    // suite would notice, because the leak looks like ordinary working code.
    const discovered = discoverTenantScopedTables();
    const declared = new Set<string>([...TenantScopedTables, ...TenantSharedTierTables]);
    const missing = discovered.filter((it) => !declared.has(it.table)).map((it) => it.table);

    expect(missing, `tenant-scoped tables with no row-level-security policy: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares every nullable tenant_id table as shared-tier, never strict', () => {
    // A nullable tenant_id under the strict predicate is a silent data blackout:
    // `tenant_id = <current>` is NULL for those rows, so they are invisible to
    // every tenant and un-insertable. `notification_templates` shipped exactly
    // this way. Discovering nullability is what makes the guard load-bearing.
    const strict = new Set<string>(TenantScopedTables);
    const misfiled = discoverTenantScopedTables()
      .filter((it) => it.nullable && strict.has(it.table))
      .map((it) => it.table);

    expect(
      misfiled,
      `nullable tenant_id declared strict, so its shared rows are hidden: ${misfiled.join(', ')}`,
    ).toEqual([]);
  });

  it('declares no shared-tier table that is actually strict', () => {
    const nullable = new Set(
      discoverTenantScopedTables()
        .filter((it) => it.nullable)
        .map((it) => it.table),
    );
    const overclaimed = TenantSharedTierTables.filter((table) => !nullable.has(table));

    expect(overclaimed, `declared shared-tier but tenant_id is not nullable: ${overclaimed.join(', ')}`).toEqual([]);
  });

  it('never declares a table both strict and shared-tier', () => {
    const strict = new Set<string>(TenantScopedTables);
    expect(TenantSharedTierTables.filter((table) => strict.has(table))).toEqual([]);
  });

  it('declares no table twice, so a policy is never installed from two domains', () => {
    expect(TenantScopedTables).toHaveLength(new Set(TenantScopedTables).size);
  });

  it('groups tables under a domain that owns a migration set', () => {
    expect(Object.keys(TenantScopedTablesByDomain)).toEqual(['auth', 'notification']);
  });

  it('policies the tenant registry separately, since its own id is the tenant', () => {
    // `auth_tenants` has no tenant_id column, so it cannot use the shared
    // predicate — but leaving it unpolicied would expose the whole registry.
    expect(TenantScopedTables).not.toContain(TenantRegistryTable);

    const predicate = `"id" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid`;
    const sql = tenantRegistryRowLevelSecurityUpSql().join('\n');

    expect(sql).toContain(`alter table "${TenantRegistryTable}" force row level security;`);
    expect(sql).toContain(`using (${predicate}) with check (${predicate});`);
  });
});

describe('tenantRowLevelSecurityUpSql', () => {
  it('forces row level security so the table owner is not exempt', () => {
    const sql = tenantRowLevelSecurityUpSql('widgets').join('\n');

    expect(sql).toContain('alter table "widgets" enable row level security;');
    expect(sql).toContain('alter table "widgets" force row level security;');
  });

  it('writes a fail-closed predicate on both read and write', () => {
    const sql = tenantRowLevelSecurityUpSql('widgets').join('\n');
    const predicate = `"tenant_id" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid`;

    expect(sql).toContain(`using (${predicate})`);
    // Without `with check`, a tenant could INSERT rows attributed to another.
    expect(sql).toContain(`with check (${predicate})`);
    expect(sql).not.toMatch(/coalesce\s*\(\s*current_setting/iu);
  });

  it('replaces an existing policy rather than failing on re-run', () => {
    expect(tenantRowLevelSecurityUpSql('widgets').join('\n')).toContain(
      'drop policy if exists "widgets_tenant_isolation" on "widgets";',
    );
  });

  it('grants only DML to the restricted role', () => {
    const sql = tenantRowLevelSecurityUpSql('widgets').join('\n');

    expect(sql).toContain(`grant select, insert, update, delete on "widgets" to "${TenantAppRole}";`);
    expect(sql).not.toMatch(/grant all/iu);
  });

  it('targets the isolation policy at the restricted role, not at every role', () => {
    // An untargeted policy also applies to the table owner, which under FORCE
    // means the migrator's own data migrations match zero rows.
    expect(tenantRowLevelSecurityUpSql('widgets').join('\n')).toContain(
      `create policy "widgets_tenant_isolation" on "widgets" to "${TenantAppRole}" `,
    );
  });

  it('gives the system role an unrestricted policy so cross-tenant work has a path', () => {
    // BYPASSRLS is not an option: only a role that already has it may grant it,
    // so a migration running as a managed-Postgres owner cannot create such a
    // role. A permissive policy targeted at the system role is equivalent for
    // our purposes and needs no superuser.
    const sql = tenantRowLevelSecurityUpSql('widgets').join('\n');

    expect(sql).toContain(`grant select, insert, update, delete on "widgets" to "${TenantSystemRole}";`);
    expect(sql).toContain(
      `create policy "widgets_tenant_system" on "widgets" to "${TenantSystemRole}" using (true) with check (true);`,
    );
  });
});

describe('tenantSharedTierRowLevelSecurityUpSql', () => {
  const predicate = `"tenant_id" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid`;

  it('lets a tenant read the shared tier as well as its own rows', () => {
    expect(tenantSharedTierRowLevelSecurityUpSql('widgets').join('\n')).toContain(
      `using (${predicate} or "tenant_id" is null)`,
    );
  });

  it('still refuses to let a tenant write outside itself', () => {
    // Reading a shared row is fine; minting one is not — that would let a tenant
    // publish into every other tenant's view.
    expect(tenantSharedTierRowLevelSecurityUpSql('widgets').join('\n')).toContain(`with check (${predicate})`);
  });

  it('is still fail-closed when no tenant is set', () => {
    // `tenant_id is null` must not become a backdoor that returns the shared tier
    // to an unscoped caller — it does not, because the caller has no policy at
    // all until it assumes a role, but pin the predicate shape regardless.
    const sql = tenantSharedTierRowLevelSecurityUpSql('widgets').join('\n');

    expect(sql).toContain(`to "${TenantAppRole}"`);
    expect(sql).not.toMatch(/coalesce\s*\(\s*current_setting/iu);
  });
});

describe('tenantRowLevelSecurityDownSql', () => {
  it('reverses every statement the up path installs', () => {
    const sql = tenantRowLevelSecurityDownSql('widgets').join('\n');

    expect(sql).toContain('drop policy if exists "widgets_tenant_isolation" on "widgets";');
    expect(sql).toContain('alter table "widgets" no force row level security;');
    expect(sql).toContain('alter table "widgets" disable row level security;');
    expect(sql).toContain(`revoke all on "widgets" from "${TenantAppRole}";`);
  });
});

describe('tenantAppRoleUpSql', () => {
  it('creates login-less roles that cannot bypass row level security', () => {
    const sql = tenantAppRoleUpSql().join('\n');

    for (const role of [TenantAppRole, TenantSystemRole]) {
      expect(sql).toContain(`create role "${role}" nologin nobypassrls;`);
      expect(sql).toContain(`if not exists (select 1 from pg_roles where rolname = '${role}')`);
    }
  });

  it('grants the connecting user membership WITH SET, or set local role is denied', () => {
    // The whole seam hinges on this. Without it `set local role "nrb_app"` fails
    // with 42501 in every deployment — and the component test hid that by
    // issuing the grant itself. Membership that PostgreSQL 16+ creates
    // implicitly for a CREATEROLE creator carries set_option = false, so an
    // explicit grant is required even where membership already exists.
    const sql = tenantAppRoleUpSql().join('\n');

    for (const role of [TenantAppRole, TenantSystemRole]) {
      expect(sql).toContain(`execute format('grant %I to %I with inherit false, set true', '${role}', current_user)`);
    }
  });

  it('grants membership WITHOUT inherit, or the connecting role reads every tenant', () => {
    // A policy targeted `TO <role>` applies to every MEMBER of that role, not
    // only to a session that assumed it. Default membership therefore hands the
    // connecting user the system role's `using (true)` policy permanently.
    // Proven against PostgreSQL 17.6: the owner saw 2 of 2 rows with
    // `WITH SET TRUE` and 0 with `WITH INHERIT FALSE, SET TRUE`.
    const sql = tenantAppRoleUpSql().join('\n');

    expect(sql).toContain('with inherit false');
    expect(sql).not.toMatch(/grant %I to %I with set true/u);
  });

  it('refuses to install below PostgreSQL 16 rather than degrading silently', () => {
    // Per-grant inheritance does not exist before 16, so there is no way to
    // install this safely there. Failing loudly beats a cross-tenant read.
    const sql = tenantAppRoleUpSql().join('\n');

    expect(sql).toContain("current_setting('server_version_num')::int < 160000");
    expect(sql).toMatch(/raise exception 'tenant isolation requires PostgreSQL 16 or newer/u);
  });

  it('grants DML across the schema, not only on policied tables', () => {
    // SET LOCAL ROLE governs the whole transaction, so a request that joins a
    // table without a tenant_id (auth_permissions, auth_role_permissions) dies
    // with "permission denied for table" unless the role can read it too.
    const sql = tenantAppRoleUpSql().join('\n');

    for (const role of [TenantAppRole, TenantSystemRole]) {
      expect(sql).toContain(`grant select, insert, update, delete on all tables in schema public to "${role}";`);
      expect(sql).toContain(`grant usage, select on all sequences in schema public to "${role}";`);
    }
  });

  it('grants the same rights on tables a later migration creates', () => {
    // The grants above are a one-shot snapshot. Every table added after this
    // migration would otherwise be unreachable by the restricted role.
    const sql = tenantAppRoleUpSql().join('\n');

    for (const role of [TenantAppRole, TenantSystemRole]) {
      expect(sql).toContain(
        `alter default privileges in schema public grant select, insert, update, delete on tables to "${role}";`,
      );
      expect(sql).toContain(`alter default privileges in schema public grant usage, select on sequences to "${role}";`);
    }
  });
});

describe('role names', () => {
  it('are deterministic constants, not environment reads', () => {
    // Migration DDL is recorded in the ledger. Deriving a role name from
    // process.env at module load means the same migration installs different
    // grants in two deployments, and the migrator and the app can disagree.
    const source = readFileSync(new URL('./tenant-policy.ts', import.meta.url).pathname, 'utf8');

    expect(source).not.toMatch(/process\.env/u);
    expect(TenantAppRole).toBe('nrb_app');
    expect(TenantSystemRole).toBe('nrb_system');
  });
});

describe('tenantRegistryRowLevelSecurityDownSql', () => {
  it('reverses the registry policy', () => {
    const sql = tenantRegistryRowLevelSecurityDownSql().join('\n');

    expect(sql).toContain(
      `drop policy if exists "${TenantRegistryTable}_tenant_isolation" on "${TenantRegistryTable}";`,
    );
    expect(sql).toContain(`alter table "${TenantRegistryTable}" disable row level security;`);
  });
});
