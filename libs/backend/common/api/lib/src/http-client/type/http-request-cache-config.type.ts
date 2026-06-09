export interface HttpRequestCacheConfig<T = unknown> {
  key: () => Promise<string> | string;
  ttl: number;
  cacheProvider: {
    get(key: string): Promise<T | undefined> | T | undefined;
    set(key: string, value: T, ttlSeconds: number): Promise<void> | void;
  };
}
