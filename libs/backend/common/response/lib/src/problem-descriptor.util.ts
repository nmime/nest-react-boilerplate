import type { ProblemDetailsResponse } from '@app/backend-common-exception';

/**
 * Builds the single-line log descriptor for a problem, dropping any absent
 * optional fields (code, instance).
 */
export const formatProblemDescriptor = (problem: ProblemDetailsResponse): string => {
  const code = typeof problem.code === 'string' ? problem.code : undefined;

  return [
    `${problem.status} ${problem.title}`,
    code ? `code=${code}` : undefined,
    problem.instance ? `instance=${problem.instance}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
};
