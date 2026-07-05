export interface RedisLock {
  resource: string;
  key: string;
  token: string;
  ttlMs: number;
  expiresAt: number;
}

export interface RedisLockAcquireOptions {
  resource: string;
  ttlMs: number;
  retryCount?: number;
  retryDelayMs?: number;
  retryJitterMs?: number;
  driftFactor?: number;
}

export interface RedisLockUsingOptions<T> extends RedisLockAcquireOptions {
  action: (lock: RedisLock) => T | Promise<T>;
}
