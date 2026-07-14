import type { ProblemDetails } from '@app/backend-common-exception';

/**
 * Builds the single-line log descriptor for a problem, dropping any absent
 * optional fields (code, instance).
 */
export const formatProblemDescriptor = (problem: ProblemDetails): string =>
  [
    `${problem.status} ${problem.title}`,
    problem.code ? `code=${problem.code}` : undefined,
    problem.instance ? `instance=${problem.instance}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
