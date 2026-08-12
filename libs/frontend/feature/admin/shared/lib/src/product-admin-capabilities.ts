import type { AdminCapabilityExtension } from './access-policy';

/**
 * The one file a product edits to add its own admin console capabilities.
 *
 * It ships empty on purpose: the shared capability map stays boilerplate-owned so upgrades never
 * conflict, and everything a product adds lives here. Composition validates the result at module
 * load, so a capability clash fails the process rather than rendering a screen gated on the wrong
 * permission. Keep the `as const satisfies` — it is what carries the capability names into
 * `AdminAccessPolicy`, so a route guard can read `access?.canReadJobs` without a cast.
 *
 * ```ts
 * export const productAdminCapabilityExtensions = [
 *   { id: 'catalog', capabilities: { canReadCatalogItems: 'catalog:items:read' } },
 * ] as const satisfies readonly AdminCapabilityExtension[];
 * ```
 */
export const productAdminCapabilityExtensions = [] as const satisfies readonly AdminCapabilityExtension[];
