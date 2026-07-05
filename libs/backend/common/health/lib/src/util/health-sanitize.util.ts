import type { HealthSafeDetails } from "../dto";

const unsafeDetailKeyPattern =
  /(authorization|cookie|credential|passwd|password|private[_-]?key|secret|token)/iu;
const redactedDetailValue = "[redacted]";

export function sanitizeHealthDetails(
  details: HealthSafeDetails | undefined,
): HealthSafeDetails | undefined {
  if (!details) {
    return undefined;
  }

  return sanitizeRecord(details);
}

function sanitizeRecord(record: HealthSafeDetails): HealthSafeDetails {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      sanitizeValue(key, value),
    ]),
  );
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (unsafeDetailKeyPattern.test(key)) {
    return redactedDetailValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeRecord(value as HealthSafeDetails);
  }

  return value;
}
