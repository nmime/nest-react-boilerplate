/**
 * Canonical, product-owned namespace for RFC 9457 problem types.
 *
 * `pnpm nrb init --domain <root-domain>` replaces the reserved example domain
 * with the product domain. Keep repository/package names out of this public
 * identifier: a problem type describes API semantics, not source provenance.
 */
export const ProblemTypeBaseUrl = 'https://example.com/problems';

const ProblemCodePattern = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;

export function problemTypeForCode(code: string): string {
  const normalized = code.trim();

  if (!ProblemCodePattern.test(normalized)) {
    throw new TypeError(`Invalid problem code: ${JSON.stringify(code)}`);
  }

  return `${ProblemTypeBaseUrl}/${normalized}`;
}
