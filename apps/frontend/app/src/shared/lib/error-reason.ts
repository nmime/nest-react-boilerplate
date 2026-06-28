export const getErrorReason = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message.trim().length > 0 ? error.message : fallback;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    /* v8 ignore next 3 -- error objects can expose equivalent human-readable fields from different backends. */
    const message = record["detail"] ?? record["message"] ?? record["title"];
    /* v8 ignore next -- blank object messages fall back to default copy. */
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
};
