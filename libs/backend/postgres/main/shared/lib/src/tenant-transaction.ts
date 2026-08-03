import type { EntityManager } from '@mikro-orm/postgresql';
import { TenantAppRole, TenantContextGuc } from '@app/backend-common-tenant-policy';

/**
 * The ORM-facing half of tenant isolation. The DDL and the table registry live in
 * `@app/backend-common-tenant-policy`, which is a dependency-free leaf so the
 * pruned migrator image can install policies without pulling this barrel's Nest
 * module graph (and `@fastify/cookie`) along with it.
 */
export { TenantAppRole, TenantContextGuc };

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
    const connection = tx.getConnection();
    // `getTransactionContext()` is loosely typed upstream; keep it opaque so
    // passing it through stays type-safe here.
    const transactionContext: unknown = tx.getTransactionContext();

    // The role name is a controlled constant, never user input, so interpolating
    // it is safe — `SET LOCAL ROLE` rejects a bind parameter.
    await connection.execute(`set local role "${TenantAppRole}"`, [], 'run', transactionContext);
    // The tenant id IS bound; MikroORM inlines it as an escaped literal because
    // `SET` does not accept parameters, which keeps it injection-safe.
    await connection.execute(`set local ${TenantContextGuc} = ?`, [tenantId], 'run', transactionContext);

    return work(tx);
  });
}

/**
 * Runs `work` for operations that legitimately span tenants — accepting an
 * invitation by token, listing a user's tenants, billing rollups.
 *
 * `systemEm` must be the EntityManager of a `BYPASSRLS` connection. A magic GUC
 * value cannot serve this purpose: once policies are fail-closed against
 * `current_setting('app.current_tenant', true)`, no value yields rows across
 * tenants, so a cross-tenant read would silently return empty rather than fail.
 * The transaction here is only for atomicity and connection pinning.
 */
export async function withSystemContext<T>(
  systemEm: EntityManager,
  work: (system: EntityManager) => Promise<T> | T,
): Promise<T> {
  return systemEm.transactional(work);
}
