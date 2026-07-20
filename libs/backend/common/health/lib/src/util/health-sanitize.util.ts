import type { HealthSafeDetails } from '../dto';

const unsafeDetailKeyPatterns: readonly RegExp[] = [
  /authorization|bearer|cookie|credential|passwd|password|secret|token|jwt|ssn/iu,
  /(private|api|access)[_-]?key/iu,
  /session[_-]?id/iu,
];
const redactedDetailValue = '[redacted]';
const credentialAssignmentPattern =
  /\b(authorization|bearer|cookie|credential|passwd|password|secret|token|jwt|ssn|session[_-]?id)\s*[:=]\s*([^\s,;]+)/giu;
const credentialKeyAssignmentPattern = /\b((?:private|api|access)[_-]?key)\s*[:=]\s*([^\s,;]+)/giu;
const credentialUrlPattern = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/giu;

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

  if (typeof value === 'string') {
    return value
      .replace(credentialUrlPattern, '$1[redacted]:[redacted]@')
      .replace(credentialAssignmentPattern, '$1=[redacted]')
      .replace(credentialKeyAssignmentPattern, '$1=[redacted]');
  }

  if (value && typeof value === 'object') {
    return sanitizeRecord(value as HealthSafeDetails);
  }

  return value;
}
