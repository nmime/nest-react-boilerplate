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
