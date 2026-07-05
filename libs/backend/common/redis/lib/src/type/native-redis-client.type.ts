// Lib-private boundary types for the native `redis` client. Intentionally NOT
// re-exported from type/index.ts: they describe the third-party client surface
// the adapter wraps and must stay out of the public @app/backend-common-redis API.
import type {
  RedisSetCondition,
  RedisSetExpirationMode,
} from "./redis-client.type";

export interface NativeRedisSetOptions {
  expiration?: {
    type: RedisSetExpirationMode;
    value: number;
  };
  condition?: RedisSetCondition;
}

export interface NativeRedisClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  close(): Promise<unknown>;
  destroy(): void | Promise<unknown>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: NativeRedisSetOptions,
  ): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<string>;
  mGet(keys: string[]): Promise<Array<string | null>>;
  del(keys: string | string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number | boolean>;
  hSet(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, field: string): Promise<number>;
  sendCommand(command: string[]): Promise<unknown>;
  on?(event: "error", listener: (error: Error) => void): NativeRedisClient;
}
