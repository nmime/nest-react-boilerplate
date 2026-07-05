// Lib-private cache-operation types. Intentionally NOT re-exported from
// type/index.ts: they support RedisCacheService internals only and must stay
// out of the public @app/backend-common-redis API.
export type CacheableErrorListener = (error: unknown) => void;

export interface CacheOperationContext {
  error?: unknown;
}
