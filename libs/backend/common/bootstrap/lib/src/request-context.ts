import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * CLS (Continuation Local Storage) context for request-scoped data.
 *
 * Pattern (same as xrocket's nestjs-cls but zero deps):
 *  - One AsyncLocalStorage per process
 *  - Bootstrap interceptor enters context per request, generates requestId
 *  - All downstream code reads from CLS — same requestId, no header passing
 *
 * Usage:
 *   const requestId = requestContext.getRequestId();
 *   requestContext.set('userId', 'abc');
 *   const userId = requestContext.get('userId');
 */

interface RequestContextData {
  requestId: string;
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContextData>();

const requestContext = {
  /**
   * Enter CLS context for a request.
   * If existingId is provided (client sent x-request-id), use it; otherwise generate.
   */
  run<T>(fn: () => T, existingId?: string): T {
    return storage.run({ requestId: existingId ?? randomUUID() }, fn);
  },

  /** Get the current request ID. Returns undefined if outside request context. */
  getRequestId(): string | undefined {
    const store = storage.getStore();
    return store?.requestId;
  },

  /** Get any value from the request context. */
  get<T = unknown>(key: string): T | undefined {
    const store = storage.getStore();
    return store?.[key] as T | undefined;
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

  /** Expose the raw AsyncLocalStorage for advanced use (e.g., Fastify hooks). */
  storage,
};

export { requestContext };
