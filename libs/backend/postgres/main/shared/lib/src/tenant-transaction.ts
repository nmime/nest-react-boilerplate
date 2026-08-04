import type { EntityManager } from '@mikro-orm/postgresql';
import { TenantAppRole, TenantContextGuc, TenantSystemRole } from '@app/backend-common-tenant-policy';

/**
 * The ORM-facing half of tenant isolation. The DDL and the table registry live in
 * `@app/backend-common-tenant-policy`, which is a dependency-free leaf so the
 * pruned migrator image can install policies without pulling this barrel's Nest
 * module graph (and `@fastify/cookie`) along with it.
 */
export { TenantAppRole, TenantContextGuc, TenantSystemRole };

/**
 * `SET LOCAL ROLE` on the transaction's pinned connection.
 *
 * The role name is a controlled constant, never user input, so interpolating it
 * is safe — `SET LOCAL ROLE` rejects a bind parameter.
 */
async function setLocalOnTransaction(tx: EntityManager, sql: string, params: unknown[] = []): Promise<void> {
  // `getTransactionContext()` is loosely typed upstream; keep it opaque so
  // passing it through stays type-safe here. Passing it at all is the whole
  // point: without it MikroORM borrows an arbitrary pooled connection and the
  // `SET LOCAL` evaporates.
  const transactionContext: unknown = tx.getTransactionContext();
  await tx.getConnection().execute(sql, params, 'run', transactionContext);
}

async function assumeRole(tx: EntityManager, role: string): Promise<void> {
  await setLocalOnTransaction(tx, `set local role "${role}"`);
}

/**
 * Runs `work` in a transaction whose whole lifetime has the tenant GUC and the
 * restricted role set, so Postgres scopes every statement to `tenantId`.
 *
 * The `SET LOCAL`s and everything `work` does MUST run on the transaction's
 * pinned connection. MikroORM's raw `Connection.execute()` binds to that
 * connection only when the transaction context is passed; without it each raw
 * statement borrows an arbitrary pooled connection where `SET LOCAL` evaporates,
 * and the query then runs as the pool's role with policies disabled. ORM
 * operations (`em.find`, repositories, ...) thread the context automatically —
 * only hand-written SQL needs it explicitly, which is exactly the trap that makes
 * a broken implementation look like a working one.
 */
export async function withTenantTransaction<T>(
  em: EntityManager,
  tenantId: string,
  work: (scoped: EntityManager) => Promise<T> | T,
): Promise<T> {
  return em.transactional(async (tx) => {
    await assumeRole(tx, TenantAppRole);
    // The tenant id IS bound; MikroORM inlines it as an escaped literal because
    // `SET` does not accept parameters, which keeps it injection-safe.
    await setLocalOnTransaction(tx, `set local ${TenantContextGuc} = ?`, [tenantId]);

    return work(tx);
  });
}

/**
 * Runs `work` for operations that legitimately span tenants — accepting an
 * invitation by token, listing a user's tenants, login by email, billing
 * rollups, and the migrator's own data backfills.
 *
 * The mechanism is {@link TenantSystemRole}, whose policy on every policied
 * table is `using (true)`. A `BYPASSRLS` connection would be the textbook
 * answer and is not available to us: only a role that already holds `BYPASSRLS`
 * may create another one, so a migration running as an ordinary managed-Postgres
 * owner cannot mint it. A magic GUC value cannot serve either — once policies
 * are fail-closed against `current_setting(..., true)`, no value yields rows
 * across tenants, so a cross-tenant read would silently return empty.
 *
 * This runs on the SAME EntityManager as tenant work; no second data source is
 * needed. The transaction bounds the role switch and pins the connection.
 */
export async function withSystemContext<T>(
  systemEm: EntityManager,
  work: (system: EntityManager) => Promise<T> | T,
): Promise<T> {
  return systemEm.transactional(async (tx) => {
    await assumeRole(tx, TenantSystemRole);
    return work(tx);
  });
}
