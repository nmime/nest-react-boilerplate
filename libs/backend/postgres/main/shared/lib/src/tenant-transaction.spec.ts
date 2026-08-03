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
  tenantAppRoleUpSql,
  tenantRegistryRowLevelSecurityDownSql,
  tenantRegistryRowLevelSecurityUpSql,
  tenantRowLevelSecurityDownSql,
  tenantRowLevelSecurityUpSql,
  withSystemContext,
  withTenantTransaction,
} from './tenant-transaction';

const postgresMainRoot = new URL('../../../', import.meta.url).pathname;

/**
 * Every entity table under libs/backend/postgres/main declaring a `tenant_id`.
 *
 * Split per `new EntitySchema` block, not per file: `auth-tenant.entity.ts`
 * defines three tables and only two of them carry the column, so matching at file
 * level reported `auth_tenants` as tenant-scoped when its own `id` is the tenant.
 */
function tenantScopedTablesInFile(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split(/(?=new EntitySchema)/u)
    .filter((block) => block.includes('tenant_id'))
    .map((block) => /tableName:\s*'([a-z_]+)'/u.exec(block)?.[1])
    .filter((table): table is string => table !== undefined);
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

function discoverTenantScopedTables(): string[] {
  const found = new Set(entityFiles(postgresMainRoot).flatMap(tenantScopedTablesInFile));
  return [...found].sort((left, right) => left.localeCompare(right));
}

describe('TenantScopedTablesByDomain', () => {
  it('covers every entity table that carries a tenant_id', () => {
    // This is the guard that matters. A new tenant-scoped table left out of the
    // list gets no policy and leaks across tenants — and nothing else in the
    // suite would notice, because the leak looks like ordinary working code.
    const discovered = discoverTenantScopedTables();
    const declared = new Set<string>(TenantScopedTables);
    const missing = discovered.filter((table) => !declared.has(table));

    expect(missing, `tenant-scoped tables with no row-level-security policy: ${missing.join(', ')}`).toEqual([]);
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
  it('creates a login-less role that cannot bypass row level security', () => {
    const sql = tenantAppRoleUpSql().join('\n');

    expect(sql).toContain(`create role "${TenantAppRole}" nologin nobypassrls;`);
    expect(sql).toContain(`if not exists (select 1 from pg_roles where rolname = '${TenantAppRole}')`);
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

/** Records what a scoped transaction executes, and on which connection context. */
function recordingEntityManager(): {
  em: Parameters<typeof withTenantTransaction>[0];
  statements: { sql: string; params: unknown[]; context: unknown }[];
} {
  const statements: { sql: string; params: unknown[]; context: unknown }[] = [];
  const transactionContext = { id: 'pinned-connection' };
  const scoped = {
    getConnection: () => ({
      execute: (sql: string, params: unknown[], _method: string, context: unknown) => {
        statements.push({ context, params, sql });
        return Promise.resolve([]);
      },
    }),
    getTransactionContext: () => transactionContext,
  };
  const em = {
    transactional: async <T>(handler: (tx: typeof scoped) => Promise<T> | T): Promise<T> => handler(scoped),
  };

  return { statements, em: em as unknown as Parameters<typeof withTenantTransaction>[0] };
}

describe('withTenantTransaction', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  it('sets the restricted role and the tenant GUC on the pinned connection', async () => {
    // The context argument is the whole point: without it MikroORM runs the raw
    // statement on an arbitrary pooled connection where SET LOCAL never applied,
    // and the query silently escapes row-level security.
    const { em, statements } = recordingEntityManager();

    await withTenantTransaction(em, tenantId, () => undefined);

    expect(statements.map((entry) => entry.sql)).toEqual([
      `set local role "${TenantAppRole}"`,
      `set local ${TenantContextGuc} = ?`,
    ]);
    expect(statements[1]?.params).toEqual([tenantId]);
    for (const statement of statements) {
      expect(statement.context, 'every scoping statement must run on the transaction context').toEqual({
        id: 'pinned-connection',
      });
    }
  });

  it('sets the role before the tenant, so the GUC applies to the restricted role', async () => {
    const { em, statements } = recordingEntityManager();

    await withTenantTransaction(em, tenantId, () => undefined);

    expect(statements[0]?.sql).toContain('set local role');
  });

  it('binds the tenant id as a parameter rather than interpolating it', async () => {
    const { em, statements } = recordingEntityManager();

    await withTenantTransaction(em, `'; drop table auth_users; --`, () => undefined);

    expect(statements[1]?.sql).toBe(`set local ${TenantContextGuc} = ?`);
    expect(statements[1]?.sql).not.toContain('drop table');
  });

  it('returns the work result and hands it the scoped manager', async () => {
    const { em } = recordingEntityManager();

    await expect(
      withTenantTransaction(em, tenantId, (scoped) => {
        expect(scoped).toBeDefined();
        return 'done';
      }),
    ).resolves.toBe('done');
  });

  it('propagates a failure from the work', async () => {
    const { em } = recordingEntityManager();

    await expect(
      withTenantTransaction(em, tenantId, () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
  });
});

describe('withSystemContext', () => {
  it('opens a transaction without setting any tenant scope', async () => {
    const { em, statements } = recordingEntityManager();

    await expect(withSystemContext(em, () => 'system')).resolves.toBe('system');
    // No role switch and no GUC: the BYPASSRLS connection is the mechanism.
    expect(statements).toEqual([]);
  });
});
