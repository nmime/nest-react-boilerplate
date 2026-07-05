import { ProblemTypeBaseUrl } from "../const/problem-type-base-url.const";
import type { ProblemDetails } from "../type/problem-details.type";
import type { ProblemDetailsInput } from "../type/problem-details-input.type";

const problemDetailsReservedExtensionKeys = new Set([
  "type",
  "title",
  "status",
  "detail",
  "instance",
  "code",
  "localizedDetail",
]);

function sanitizeProblemDetailsExtensions(
  extensions: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(extensions).filter(
      ([key]) => !problemDetailsReservedExtensionKeys.has(key),
    ),
  );
}

function normalizeProblemInstance(
  instance: string | undefined,
): string | undefined {
  const normalized = instance?.trim();

  if (!normalized || normalized.startsWith("/")) {
    return undefined;
  }

  return normalized;
}

export const createProblemDetails = ({
  title,
  status,
  code,
  detail,
  type = code ? `${ProblemTypeBaseUrl}:${code}` : "about:blank",
  instance,
  extensions = {},
}: ProblemDetailsInput): ProblemDetails => {
  const normalizedInstance = normalizeProblemInstance(instance);

  return {
    type,
    title,
    status,
    ...(detail ? { detail } : {}),
    ...(normalizedInstance ? { instance: normalizedInstance } : {}),
    ...(code ? { code } : {}),
    ...sanitizeProblemDetailsExtensions(extensions),
  };
};
