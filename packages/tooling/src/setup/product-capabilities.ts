import type { CapabilityEntry } from './catalog.js';

/**
 * The one file a product edits to add capabilities of its own.
 *
 * It ships empty on purpose. A capability entry is how this workspace seeds libraries into the
 * selected closure, env keys into the generated Compose and Helm surface, Docker services into the
 * generated profiles, and Nest modules into the selected backend hosts — everything a product's own
 * domain needs. The shipped catalog stays boilerplate-owned so upgrades never conflict, and
 * everything a product adds lives here.
 *
 * Composition validates the result when this module loads, so an entry that names a capability or
 * an app that does not exist fails the process rather than producing a selection that resolves for
 * some ids and silently not for others.
 *
 * ```ts
 * export const productCapabilities: readonly CapabilityEntry[] = [
 *   {
 *     id: 'marketplace',
 *     label: 'Marketplace',
 *     activation: 'nest-module',
 *     requiresCapabilities: ['authz', 's3'],
 *     requiresApps: ['user-app-api'],
 *     conflictsWith: [],
 *     ownedProjects: ['@product/backend-feature-marketplace'],
 *     dockerServices: [],
 *     environmentVariables: ['MARKETPLACE_LEDGER_URL'],
 *     backendWiring: [
 *       {
 *         hosts: ['user-app-api'],
 *         importName: 'MarketplaceModule',
 *         importPath: '@product/backend-feature-marketplace',
 *         moduleExpression: 'MarketplaceModule.forRoot()',
 *       },
 *     ],
 *   },
 * ];
 * ```
 *
 * The id is addressed verbatim as a Docker Compose profile and as a selection key, so it must be
 * lower-case kebab-case. Registering one makes it selectable through `pnpm nrb setup` and through
 * the `setup` generator exactly like a shipped capability.
 */
export const productCapabilities: readonly CapabilityEntry[] = [];
