import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * CLS (Continuation Local Storage) context — same pattern as xrocket's nestjs-cls.
 *
 * Single AsyncLocalStorage instance per process. Per request:
 *  - Bootstrap middleware enters context, generates requestId
 *  - All downstream code (controllers, services, filters, interceptors) reads from CLS
 *  - One requestId per request, guaranteed same across all async operations
 *
 * Usage:
 *   const requestId = requestContext.getRequestId();
 *   requestContext.set('userId', '123');
 *   const userId = requestContext.get('userId');
 */

interface RequestContextData {
  requestId: string;
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const requestContext = {
  /**
   * Enter CLS context. Use with optional existingId (from client x-request-id header).
   * If no existingId, generates a new UUID.
   */
  run<T>(fn: () => T, existingId?: string): T {
    return storage.run({ requestId: existingId ?? randomUUID() }, fn);
  },

  /** Get the current request ID. Returns undefined outside request context. */
  getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
  },

  /** Get any value from the request context. */
  get<T = unknown>(key: string): T | undefined {
    return storage.getStore()?.[key] as T | undefined;
  },

  /** Set a value in the request context. */
  set(key: string, value: unknown): void {
    const store = storage.getStore();
    if (store) {
      store[key] = value;
    }
  },

  /** Check if we're inside a request context. */
  isAvailable(): boolean {
    return storage.getStore() !== undefined;
  },
};
