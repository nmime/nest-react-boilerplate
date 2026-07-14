import type { Attributes } from '@opentelemetry/api';

export function toAttributes(attributes: Record<string, unknown>): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).flatMap(([key, value]) => {
      const attribute = toAttributeValue(value);
      return attribute === undefined ? [] : [[key, attribute]];
    }),
  );
}

// eslint-disable-next-line sonarjs/function-return-type -- OpenTelemetry attributes support scalar and homogeneous array values.
function toAttributeValue(value: unknown): Attributes[string] | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.every((item): item is string => typeof item === 'string')) {
      return value;
    }
    if (value.every((item): item is number => typeof item === 'number')) {
      return value;
    }
    if (value.every((item): item is boolean => typeof item === 'boolean')) {
      return value;
    }
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}
