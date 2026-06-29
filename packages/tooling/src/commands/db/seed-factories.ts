/**
 * Deterministic seed factory primitives.
 *
 * Zero-dependency, no randomness, no secrets. Designed for:
 * - Component tests that need reproducible fixture data.
 * - E2E tests that need stable baseline records.
 * - Seed commands that produce identical output across runs.
 */

export interface Sequence {
  current: number;
  next(): number;
  reset(): void;
  setTo(value: number): void;
}

export function defineSequence(start = 1): Sequence {
  let current = start;
  return {
    get current(): number {
      return current;
    },
    next(): number {
      return ++current;
    },
    reset(): void {
      current = start;
    },
    setTo(value: number): void {
      current = value;
    },
  };
}

export type FactoryAttr<T> = T | ((ctx: FactoryBuildContext) => T);

export interface FactoryBuildContext {
  sequence: Sequence;
  overrides: Record<string, unknown>;
}

export type Trait = Record<string, unknown>;

export interface Factory {
  build(overrides?: Record<string, unknown>): Record<string, unknown>;
  buildList(
    count: number,
    perIndexOverrides?: (index: number) => Record<string, unknown>,
  ): Record<string, unknown>[];
  buildWith(
    traits: (string | Record<string, unknown>)[],
  ): Record<string, unknown>;
  getSequence(): Sequence;
}

export type FactoryDefinition = Record<string, FactoryAttr<unknown>>;

export interface WithTraits {
  buildWith(
    traits: (string | Record<string, unknown>)[],
  ): Record<string, unknown>;
  buildListWith(
    count: number,
    traits: (string | Record<string, unknown>)[],
  ): Record<string, unknown>[];
}

export function createFactory(definition: FactoryDefinition): Factory {
  const seq = defineSequence(0);

  function resolveAttr(
    value: FactoryAttr<unknown>,
    overrides: Record<string, unknown>,
  ): unknown {
    const ctx: FactoryBuildContext = { sequence: seq, overrides };
    return typeof value === "function"
      ? (value as (ctx: FactoryBuildContext) => unknown)(ctx)
      : value;
  }

  const traitRegistry: Record<string, Trait> = {};

  function applyTraits(
    traits: (string | Record<string, unknown>)[],
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const trait of traits) {
      if (typeof trait === "string") {
        Object.assign(merged, traitRegistry[trait] ?? {});
      } else {
        Object.assign(merged, trait);
      }
    }
    return merged;
  }

  function buildRecord(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const key of Object.keys(definition)) {
      const overrideValue = overrides[key];
      if (overrideValue !== undefined) {
        record[key] = overrideValue;
      } else {
        record[key] = resolveAttr(definition[key], overrides);
      }
    }
    return record;
  }

  const factory: Factory = {
    build(overrides: Record<string, unknown> = {}) {
      return buildRecord(overrides);
    },
    buildList(count, perIndexOverrides) {
      const results: Record<string, unknown>[] = [];
      for (let i = 0; i < count; i += 1) {
        results.push(buildRecord(perIndexOverrides?.(i) ?? {}));
      }
      return results;
    },
    buildWith(traits) {
      return buildRecord(applyTraits(traits));
    },
    getSequence() {
      return seq;
    },
  };

  factory.buildWith = (traits) => buildRecord(applyTraits(traits));
  (factory as unknown as Record<string, unknown>).__traitRegistry = traitRegistry;

  return factory;
}

export function createFactoryWithTraits(
  definition: FactoryDefinition,
  traits: Record<string, Trait>,
): Factory & WithTraits {
  const factory = createFactory(definition);
  const registry = (factory as unknown as Record<string, unknown>).__traitRegistry as Record<string, Trait>;
  for (const [name, trait] of Object.entries(traits)) {
    registry[name] = trait;
  }

  const buildWith = (traitList: (string | Record<string, unknown>)[]) => {
    const merged: Record<string, unknown> = {};
    for (const trait of traitList) {
      if (typeof trait === "string") {
        Object.assign(merged, traits[trait] ?? {});
      } else {
        Object.assign(merged, trait);
      }
    }
    return factory.build(merged);
  };

  const buildListWith = (count: number, traitList: (string | Record<string, unknown>)[]) => {
    const overrides: Record<string, unknown> = {};
    for (const trait of traitList) {
      if (typeof trait === "string") {
        Object.assign(overrides, traits[trait] ?? {});
      } else {
        Object.assign(overrides, trait);
      }
    }
    return factory.buildList(count, () => overrides);
  };

  return Object.assign(factory, { buildWith, buildListWith });
}

export function resetFactory(factory: Factory): void {
  factory.getSequence().reset();
}

export function createCompositeFactory(
  outerDefinition: FactoryDefinition,
  innerKey: string,
  innerFactory: Factory,
): Factory {
  return createFactory({
    ...outerDefinition,
    [innerKey]: () => innerFactory.build(),
  });
}

export const globalSequence = defineSequence(0);

export function createGlobalFactory(
  definition: FactoryDefinition,
): Factory {
  const wrappedDefinition: FactoryDefinition = {};
  for (const key of Object.keys(definition)) {
    const value = definition[key];
    if (typeof value === "function") {
      wrappedDefinition[key] = (ctx: FactoryBuildContext) =>
        (value as (ctx: FactoryBuildContext) => unknown)({
          ...ctx,
          sequence: globalSequence,
        });
    } else {
      wrappedDefinition[key] = value;
    }
  }
  return createFactory(wrappedDefinition);
}
