export function deserializeValue<T>(cached: string, deserialize: ((raw: string) => T) | undefined): T {
  return (deserialize?.(cached) ?? JSON.parse(cached)) as T;
}
