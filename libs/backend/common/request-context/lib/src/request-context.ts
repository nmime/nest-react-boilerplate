import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { isRequestId } from '@app/common-problem-details';

interface RequestContextData {
  requestId: string;
  values: Map<string, unknown>;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export function normalizeRequestId(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized && isRequestId(normalized) ? normalized : undefined;
}

export const requestContext = {
  run<T>(fn: () => T, existingId?: string): T {
    return storage.run({ requestId: normalizeRequestId(existingId) ?? randomUUID(), values: new Map() }, fn);
  },

  getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  },

  get<T = unknown>(key: string): T | undefined {
    return storage.getStore()?.values.get(key) as T | undefined;
  },

  set(key: string, value: unknown): void {
    const store = storage.getStore();
    if (store) {
      store.values.set(key, value);
    }
  },

  isAvailable(): boolean {
    return storage.getStore() !== undefined;
  },
};
