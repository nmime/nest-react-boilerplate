import { ProblemTypeBaseUrl } from "../const/problem-type-base-url.const";
import type { ProblemDetails } from "../type/problem-details.type";

const problemDetailsReservedKeys = new Set([
  "type",
  "title",
  "status",
  "detail",
  "instance",
  "code",
  "localizedDetail",
  "info",
]);

function sanitizeExtensions(
  extensions: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(extensions).filter(
      ([key]) => !problemDetailsReservedKeys.has(key),
    ),
  );
}

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
  type = code ? `${ProblemTypeBaseUrl}:${code}` : "about:blank",
  instance,
}: ProblemDetailsOptions): ProblemDetails => {
  const normalizedInstance = instance?.trim();

  return {
    type,
    title,
    status,
    detail,
    ...(normalizedInstance && !normalizedInstance.startsWith("/")
      ? { instance: normalizedInstance }
      : {}),
    ...(code ? { code } : {}),
  } as ProblemDetails;
};
