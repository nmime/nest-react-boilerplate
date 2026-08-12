// @requirements REQ-FRONTEND-ACCESSIBILITY-003
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tailwind v4 reads `--color-*`, `--font-*` and `--radius-*` out of `@theme`, and the shadcn
// primitives this library wraps read the unprefixed semantic tokens below. Everything else the
// design system defines is namespaced `--xr-`; a product palette belongs in the consuming app's
// stylesheet, not in the stylesheet every app inherits.
const themeBridgePrefixes = ['--xr-', '--color-', '--font-', '--radius'];
const themeBridgeProperties = new Set([
  '--accent',
  '--accent-foreground',
  '--background',
  '--border',
  '--card',
  '--card-foreground',
  '--destructive',
  '--destructive-foreground',
  '--foreground',
  '--input',
  '--muted',
  '--muted-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--ring',
  '--secondary',
  '--secondary-foreground',
  '--sidebar',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-ring',
]);
const allowedClassPrefixes = ['.xr-', '.sr-only'];

const findNamespaceViolations = (css: string): string[] => {
  // Indentation is spelled out as spaces and tabs rather than as "whitespace that is not a
  // newline": the negated form makes the two runs around the name look ambiguous to a scanner
  // even though a property name can never be whitespace.
  const customProperties = [...css.matchAll(/^[ \t]*(--[a-zA-Z0-9-]+)[ \t]*:/gmu)]
    .map((match) => match[1] ?? '')
    .filter(
      (property) =>
        !themeBridgeProperties.has(property) && !themeBridgePrefixes.some((prefix) => property.startsWith(prefix)),
    );

  // Only the text that introduces a block is a selector; matching class-shaped text anywhere would
  // also flag file extensions inside `url()` and `@source`.
  const classSelectors = css
    .split('{')
    .slice(0, -1)
    .flatMap((chunk) => {
      const selector = chunk.slice(Math.max(chunk.lastIndexOf('}'), chunk.lastIndexOf(';')) + 1);
      return [...selector.matchAll(/(\.[a-zA-Z_-][\w-]*)/gu)].map((match) => match[1] ?? '');
    })
    .filter((selector) => !allowedClassPrefixes.some((prefix) => selector.startsWith(prefix)));

  return [...new Set([...customProperties, ...classSelectors])].sort((left, right) => left.localeCompare(right));
};

const sharedStylesheet = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');

describe('shared design-system namespace', () => {
  it('keeps every custom property and class in the shared stylesheet inside the design-system namespace', () => {
    expect(findNamespaceViolations(sharedStylesheet)).toEqual([]);
  });

  it('rejects a product palette appended to the shared stylesheet', () => {
    const productPalette = `
:root {
  --bg-cream: #faf0de;
  --green-primary: #1ca24c;
}
.xr-agritech-card { background: var(--bg-cream); }
.marketplace-banner { color: var(--green-primary); }
`;

    expect(findNamespaceViolations(productPalette)).toEqual(['--bg-cream', '--green-primary', '.marketplace-banner']);
  });
});
