// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { describe, expect, it } from 'vitest';
import { TenantAppRole, TenantContextGuc, TenantSystemRole } from '@app/backend-common-tenant-policy';
import { withSystemContext, withTenantTransaction } from './tenant-transaction';

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
  it('assumes the system role on the pinned connection', async () => {
    // The mechanism is a role whose policy is `using (true)`, not a BYPASSRLS
    // connection: only a role that already holds BYPASSRLS may create one, so a
    // migration running as an ordinary managed-Postgres owner cannot mint it.
    const { em, statements } = recordingEntityManager();

    await expect(withSystemContext(em, () => 'system')).resolves.toBe('system');

    expect(statements.map((entry) => entry.sql)).toEqual([`set local role "${TenantSystemRole}"`]);
    expect(statements[0]?.context).toEqual({ id: 'pinned-connection' });
  });

  it('sets no tenant GUC, so system work is not scoped to one tenant', async () => {
    const { em, statements } = recordingEntityManager();

    await withSystemContext(em, () => undefined);

    expect(statements.some((entry) => entry.sql.includes(TenantContextGuc))).toBe(false);
  });

  it('propagates a failure from the work', async () => {
    const { em } = recordingEntityManager();

    await expect(
      withSystemContext(em, () => {
        throw new Error('system work failed');
      }),
    ).rejects.toThrow('system work failed');
  });
});
