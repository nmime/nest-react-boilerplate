import { maxPageSize } from '../const/pagination.const';

export function normalizePageLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 50;
  }

  /* v8 ignore next -- past the Number.isFinite guard `value` is always a finite number, so the `?? 50` fallback is unreachable; it exists only to satisfy the `number | undefined` type. */
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), maxPageSize);
}

export function normalizePageOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  /* v8 ignore next -- past the Number.isFinite guard `value` is always a finite number, so the `?? 0` fallback is unreachable; it exists only to satisfy the `number | undefined` type. */
  return Math.max(Math.trunc(value ?? 0), 0);
}
