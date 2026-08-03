import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Metadata key carrying the reason a route is allowed to run without a tenant. */
export const TenantScopeExemptMetadataKey = 'tenant:scope-exempt';

/**
 * Declares that a route legitimately has no tenant — a bot webhook, a provider
 * callback, an unauthenticated probe.
 *
 * The reason is required and stored, so an exemption is self-documenting in the
 * code and machine-readable in tests. Prefer establishing a real scope with
 * `withAmbientTenant` over exempting a route that does touch tenant data.
 */
export const TenantScopeExempt = (reason: string): CustomDecorator => SetMetadata(TenantScopeExemptMetadataKey, reason);
