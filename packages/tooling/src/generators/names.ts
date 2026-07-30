/**
 * Shared name utilities for generators.
 * Converts raw names into kebab-case, camelCase, PascalCase, and title.
 */

/** Convert a string to kebab-case. */
export function toKebab(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .replace(/[-_\s]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Convert a string to camelCase. */
export function toCamel(raw: string): string {
  const kebab = toKebab(raw);
  return kebab
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** Convert a string to PascalCase. */
export function toPascal(raw: string): string {
  const camel = toCamel(raw);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Convert a string to Title Case. */
export function toTitle(raw: string): string {
  return toKebab(raw)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Convert a string to UPPER_SNAKE_CASE constant name. */
export function toConstant(raw: string): string {
  return toKebab(raw).toUpperCase().replace(/-/g, '_');
}

/**
 * All derived names from a single raw input.
 */
export interface GeneratedNames {
  raw: string;
  kebab: string;
  camel: string;
  pascal: string;
  title: string;
  constant: string;
}

export function generateNames(raw: string): GeneratedNames {
  return {
    raw,
    kebab: toKebab(raw),
    camel: toCamel(raw),
    pascal: toPascal(raw),
    title: toTitle(raw),
    constant: toConstant(raw),
  };
}

/**
 * Deterministic placeholder used by generated executable tests until product
 * owners define or replace it in OpenSpec.
 */
export function generatedRequirementId(raw: string): string {
  return `REQ-${toKebab(raw).toUpperCase()}-SCAFFOLD-001`;
}

/**
 * Validate a generator name: must result in a non-empty kebab-case string.
 * Returns an error message or `null` if valid.
 */
export function validateName(raw: string): string | null {
  if (!raw || !raw.trim()) {
    return 'Name must not be empty';
  }
  const kebab = toKebab(raw);
  if (!kebab) {
    return 'Name must contain at least one alphanumeric character';
  }
  if (/[A-Z]/.test(raw) && !/[\s-]/.test(raw)) {
    // Allow but don't require kebab-case input
  }
  return null;
}

const adjacentOwnershipSuffix = /-(?:clone|copy|new|v\d+)$/u;
const adjacentOwnershipPrefix = /^(?:(?:clone|copy)-of|clone|copy|new)-/u;

export interface ExistingOwner {
  name: string;
  root?: string;
}

export function cloneStyleBaseName(raw: string): string {
  let base = toKebab(raw);
  for (;;) {
    const next = base.replace(adjacentOwnershipPrefix, '').replace(adjacentOwnershipSuffix, '');
    if (next === base) {
      return base;
    }
    base = next;
  }
}

/**
 * Return the existing owner that a clone-style name is trying to shadow.
 *
 * The guard is deliberately contextual: `payments-v2` remains a valid new
 * owner when no `payments` owner exists, but it cannot be generated beside an
 * existing `payments` app, library, or feature. That keeps version-like words
 * available to real products without allowing agents to bypass ownership.
 */
export function findAdjacentOwner(raw: string, owners: Iterable<ExistingOwner>): string | null {
  const requested = toKebab(raw);
  const base = cloneStyleBaseName(requested);
  if (!base || base === requested) {
    return null;
  }

  for (const owner of owners) {
    const projectName = owner.name.toLowerCase();
    const rootSegments = (owner.root ?? '')
      .split('/')
      .map((segment) => toKebab(segment))
      .filter(Boolean);

    if (projectName === base || projectName.endsWith(`-${base}`) || rootSegments.includes(base)) {
      return owner.name;
    }
  }

  return null;
}
