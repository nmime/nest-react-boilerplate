import type { AuthzExtension } from './catalog-composition';

/**
 * The one file a product edits to add its own RBAC permissions and role grants.
 *
 * It ships empty on purpose: the base catalog and role matrix stay boilerplate-owned so upgrades
 * never conflict, and everything a product adds lives here. Composition validates the result at
 * module load, so a typo in a grant fails the process rather than minting a principal that is
 * quietly missing a permission.
 *
 * ```ts
 * export const productAuthzExtensions: readonly AuthzExtension[] = [
 *   {
 *     id: 'catalog',
 *     permissions: [
 *       { key: 'catalog:items:read', resource: 'catalog.items', action: 'read', description: '…' },
 *     ],
 *     grants: [{ role: 'admin', permissions: ['catalog:items:read'] }],
 *   },
 * ];
 * ```
 */
export const productAuthzExtensions: readonly AuthzExtension[] = [];
