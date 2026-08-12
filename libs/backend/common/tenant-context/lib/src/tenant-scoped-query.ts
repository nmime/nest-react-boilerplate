import { requireAmbientTenantId } from './tenant-scope';

/** Column and property name every tenant-owned entity discriminates on. */
export const TenantDiscriminator = 'tenantId';

export type TenantScopedWhere<T> = T & Record<typeof TenantDiscriminator, string>;

/**
 * Binds a query filter to the ambient tenant.
 *
 * Repositories call this instead of taking `tenantId` as a parameter on every
 * method: the discriminator comes from the request scope, so a forgotten
 * argument becomes impossible rather than merely reviewable. A filter that names
 * a different tenant is a cross-tenant read attempt and throws — silently
 * overwriting it would hide the bug, and silently honouring it would leak data.
 */
export function tenantScopedWhere<T extends Record<string, unknown>>(where?: T): TenantScopedWhere<T> {
  const tenantId = requireAmbientTenantId();
  const requested = where?.[TenantDiscriminator];

  if (requested !== undefined && requested !== tenantId) {
    throw new Error(
      `Refusing a cross-tenant query: the filter names tenant ${String(requested)} while the ambient tenant is ${tenantId}.`,
    );
  }

  return { ...(where ?? ({} as T)), [TenantDiscriminator]: tenantId };
}

/**
 * Fails when a query filter would reach the driver without a tenant predicate.
 *
 * This is the backstop for persistence code that builds filters by hand: call it
 * from a repository (or from its tests) so an unscoped query is a loud failure
 * rather than a silent read across every tenant.
 */
export function assertTenantScoped(where: unknown, context: string): void {
  const scoped =
    typeof where === 'object' &&
    where !== null &&
    typeof (where as Record<string, unknown>)[TenantDiscriminator] === 'string';

  if (!scoped) {
    throw new Error(`Query "${context}" is missing the ${TenantDiscriminator} predicate.`);
  }
}

/**
 * MikroORM filter definition, typed structurally so this common-tier lib does not
 * depend on the ORM. Register it on a tenant-owned entity
 * (`@Filter(tenantScopeFilter)` or `filters: { ...tenantScopeFilter }` on an
 * EntitySchema) and every query through that entity carries the predicate.
 */
export interface TenantScopeFilterDefinition {
  readonly name: string;
  readonly cond: () => Record<string, string>;
  readonly default: boolean;
  readonly args: false;
}

export const tenantScopeFilter: TenantScopeFilterDefinition = {
  name: 'tenantScope',
  // Resolved per query, not per registration: the ambient tenant is request state.
  cond: () => ({ [TenantDiscriminator]: requireAmbientTenantId() }),
  default: true,
  args: false,
};
