/**
 * Composition of the shipped capability axis with the capabilities a product registers.
 *
 * The base tuple and the base catalog stay closed and boilerplate-owned; `product-capabilities.ts`
 * is the seam a product edits. Everything here is a pure function over the two, so a failed
 * registration throws while composing and can never leave a half-applied catalog behind — the same
 * guarantee the RBAC catalog composition gives.
 */
import type { CapabilityEntry } from './catalog.js';
import { productCapabilities } from './product-capabilities.js';

/** Cross-cutting capabilities this boilerplate ships. Products register their own instead. */
export const baseCapabilityIds = [
  'i18n',
  'analytics',
  'websockets',
  'feature-flags',
  'fiat-currency',
  'notifications',
  'design-tokens',
  'authz',
  'postgres',
  'mongodb',
  'redis',
  's3',
  'static-data',
  'nats',
  'otel',
  'swagger',
  'telegram-bot',
  'discord-bot',
  'tenancy',
] as const;
export type BaseCapabilityId = (typeof baseCapabilityIds)[number];

/**
 * A capability id is addressed verbatim as a Docker Compose profile, as a JSON key in
 * `.nrb/capabilities.json`, and as a CLI argument, so the shape the shipped ids already follow is
 * the shape a product's id has to follow too.
 */
const capabilityIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * The id set this checkout knows: the shipped tuple plus every registered product capability.
 *
 * Rejects an id that could not survive the places it is substituted into, and an id that is
 * already taken — a product silently shadowing `authz` would change what every existing selection
 * resolves to.
 */
export function composeCapabilityIds(baseIds: readonly string[], entries: readonly CapabilityEntry[]): string[] {
  const composed = [...baseIds];
  const seen = new Set(baseIds);

  for (const entry of entries) {
    if (!capabilityIdPattern.test(entry.id)) {
      throw new Error(
        `product capability "${entry.id}" is not a valid id; use lower-case kebab-case, as every shipped capability does`,
      );
    }
    if (seen.has(entry.id)) {
      throw new Error(`product capability redefines capability "${entry.id}"`);
    }

    seen.add(entry.id);
    composed.push(entry.id);
  }

  return composed;
}

/**
 * The capability catalog this checkout resolves against.
 *
 * A registered entry may depend on, and conflict with, both shipped and product capabilities, but
 * never one that does not exist: an unresolvable reference would surface as a selection that
 * expands to a closure missing a library rather than as a configuration error.
 */
export function composeCapabilityCatalog(
  base: Readonly<Record<string, Readonly<CapabilityEntry>>>,
  entries: readonly CapabilityEntry[],
  knownAppIds: readonly string[],
): Readonly<Record<string, Readonly<CapabilityEntry>>> {
  const knownCapabilityIds = new Set(composeCapabilityIds(Object.keys(base), entries));
  const knownApps = new Set(knownAppIds);

  for (const entry of entries) {
    for (const [relation, referenced] of [
      ['requiresCapabilities', entry.requiresCapabilities],
      ['conflictsWith', entry.conflictsWith],
    ] as const) {
      for (const capability of referenced) {
        if (!knownCapabilityIds.has(capability)) {
          throw new Error(`product capability "${entry.id}" ${relation} unknown capability "${capability}"`);
        }
      }
    }
    for (const app of entry.requiresApps) {
      if (!knownApps.has(app)) {
        throw new Error(`product capability "${entry.id}" requires unknown app "${app}"`);
      }
    }
  }

  return Object.freeze({
    ...base,
    ...Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  });
}

/** Every capability id this checkout knows, shipped and product-registered. */
export const capabilityIds: readonly string[] = Object.freeze(
  composeCapabilityIds(baseCapabilityIds, productCapabilities),
);

const capabilityIdSet = new Set(capabilityIds);

export function isCapabilityId(value: string): boolean {
  return capabilityIdSet.has(value);
}
