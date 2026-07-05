export function toCacheableTtlMilliseconds(ttlSeconds: number): number {
  return Math.max(Math.ceil(ttlSeconds * 1000), 1);
}
