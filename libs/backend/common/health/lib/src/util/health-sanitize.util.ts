import type { HealthSafeDetails } from '../dto';

const unsafeDetailKeyPatterns: readonly RegExp[] = [
  /authorization|bearer|cookie|credential|passwd|password|secret|token|jwt|ssn/iu,
  /(private|api|access)[_-]?key/iu,
  /session[_-]?id/iu,
];
const redactedDetailValue = '[redacted]';

function isUnsafeDetailKey(key: string): boolean {
  return unsafeDetailKeyPatterns.some((pattern) => pattern.test(key));
}

export function sanitizeHealthDetails(details: HealthSafeDetails | undefined): HealthSafeDetails | undefined {
  if (!details) {
    return undefined;
  }

  return sanitizeRecord(details);
}

function sanitizeRecord(record: HealthSafeDetails): HealthSafeDetails {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, sanitizeValue(key, value)]));
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (isUnsafeDetailKey(key)) {
    return redactedDetailValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === 'object') {
    return sanitizeRecord(value as HealthSafeDetails);
  }

  return value;
}
