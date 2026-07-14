import { ProblemTypeBaseUrl } from '../const/problem-type-base-url.const';
import type { ProblemDetails } from '../type/problem-details.type';

interface ProblemDetailsOptions {
  title: string;
  status: number;
  code?: string;
  detail: string;
  type?: string;
  instance?: string;
}

export const createProblemDetails = ({
  title,
  status,
  code,
  detail,
  type = code ? `${ProblemTypeBaseUrl}:${code}` : 'about:blank',
  instance,
}: ProblemDetailsOptions): ProblemDetails => {
  const normalizedInstance = instance?.trim();

  return {
    type,
    title,
    status,
    detail,
    ...(normalizedInstance && !normalizedInstance.startsWith('/') ? { instance: normalizedInstance } : {}),
    ...(code ? { code } : {}),
  };
};
