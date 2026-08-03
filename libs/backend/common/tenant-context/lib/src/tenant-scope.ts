import { requestContext } from '@app/backend-common-request-context';

/** Key the ambient tenant id is published under inside the CLS request store. */
export const TenantIdContextKey = 'tenantId';

/**
 * Tenant id used by single-tenant applications. Kept in step with
 * `DefaultAuthTenantId` in the auth feature; this lib is common-tier and must
 * not depend on a feature lib, so the value is restated rather than imported.
 * `tenant-scope.spec.ts` pins the two together.
 */
export const DefaultTenantId = '00000000-0000-0000-0000-000000000000';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Lowercased tenant id, or `undefined` when the value is absent or not a UUID. */
export function normalizeTenantId(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return uuidPattern.test(normalized) ? normalized : undefined;
}

export interface TenantScopeError {
  code: 'tenant_context_unavailable' | 'tenant_id_invalid';
  message: string;
}

/**
 * Publishes `tenantId` as the ambient tenant for the current CLS store.
 *
 * Returns an error instead of throwing so callers choose their own failure mode
 * (an interceptor turns it into an HTTP error; a queue consumer logs and drops).
 * The store is verified by reading the value back: `requestContext.set` silently
 * no-ops when no store is active, and a silent no-op here is precisely the bug
 * this lib exists to prevent — every downstream reader would then see no tenant
 * and, under fail-closed row-level security, quietly return zero rows.
 */
export function setAmbientTenantId(tenantId: string): TenantScopeError | undefined {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) {
    return { code: 'tenant_id_invalid', message: `Tenant id is not a UUID: ${tenantId}` };
  }

  requestContext.set(TenantIdContextKey, normalized);

  if (requestContext.get<string>(TenantIdContextKey) !== normalized) {
    return {
      code: 'tenant_context_unavailable',
      message:
        'No request context is active, so the ambient tenant could not be published. Ensure the CLS interceptor runs before tenant resolution.',
    };
  }

  return undefined;
}

/** The ambient tenant id, or `undefined` when none has been established. */
export function getAmbientTenantId(): string | undefined {
  return requestContext.get<string>(TenantIdContextKey);
}

/**
 * The ambient tenant id, throwing when absent.
 *
 * Repositories and other tenant-scoped readers use this so a missing scope is a
 * loud error at the call site rather than a silent empty result set.
 */
export function requireAmbientTenantId(): string {
  const tenantId = getAmbientTenantId();
  if (!tenantId) {
    throw new Error(
      'No ambient tenant is established for this execution. Wrap the work in withAmbientTenant, or declare the route @TenantScopeExempt.',
    );
  }

  return tenantId;
}

/**
 * Runs `work` with `tenantId` as the ambient tenant, creating a CLS store when
 * none is active. This is the entry point for every non-HTTP code path —
 * schedulers, queue consumers, webhook ingress — and for public HTTP routes that
 * legitimately have no principal but still touch tenant-scoped data.
 */
export function withAmbientTenant<T>(tenantId: string, work: () => T): T {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) {
    throw new Error(`Tenant id is not a UUID: ${tenantId}`);
  }

  // Both branches guarantee an active store — `run` creates one, `isAvailable`
  // proves one — so this publishes directly instead of re-checking through
  // `setAmbientTenantId`. That readback exists for the interceptor path, where
  // the store's presence is exactly what cannot be assumed.
  const publish = (): T => {
    requestContext.set(TenantIdContextKey, normalized);
    return work();
  };

  return requestContext.isAvailable() ? publish() : requestContext.run(publish);
}
