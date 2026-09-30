import { normalizeLocale, type Locale, type UiTheme } from '@app/frontend-runtime';
import type { LocalePayload } from './session-preferences-model';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

/**
 * Reads one field out of an auth payload, trying the payload itself and then its `user`, `profile`
 * and `principal` scopes. The shared payload types deliberately model only what every app needs, so
 * this is how a product surfaces a backend field (`emailVerified`, a tenant id, a plan) without
 * widening those types — and it is the same reader the locale and theme accessors below use.
 */
export const readAuthPayloadField = <Value>(
  payload: LocalePayload | null,
  field: string,
  parse: (value: unknown) => Value | undefined,
): Value | undefined => {
  const root = asRecord(payload);
  if (!root) {
    return undefined;
  }

  for (const scope of [root, asRecord(root['user']), asRecord(root['profile']), asRecord(root['principal'])]) {
    const parsed = scope ? parse(scope[field]) : undefined;
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
};

const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  /* v8 ignore next 4 -- defensive theme guard branch permutations are covered by state/store tests. */
  return normalized === 'system' || normalized === 'light' || normalized === 'dark' ? normalized : undefined;
};

export const getPayloadLocale = (payload?: LocalePayload | null): Locale | undefined =>
  readAuthPayloadField(payload ?? null, 'locale', (value) =>
    normalizeLocale(typeof value === 'string' ? value : undefined),
  );

export const getPayloadTheme = (payload?: LocalePayload | null): UiTheme | undefined =>
  readAuthPayloadField(payload ?? null, 'theme', normalizeTheme);

export const getPayloadPrincipal = (
  payload?: LocalePayload | null,
): { subject: string; tenantId: string } | undefined => {
  const parse = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const subject =
    readAuthPayloadField(payload ?? null, 'id', parse) ?? readAuthPayloadField(payload ?? null, 'subject', parse);
  const tenantId = readAuthPayloadField(payload ?? null, 'tenantId', parse);
  return subject && tenantId ? { subject, tenantId } : undefined;
};
