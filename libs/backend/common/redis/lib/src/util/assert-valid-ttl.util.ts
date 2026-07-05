export function assertValidTtl(ttlMs: number): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`Redis lock ttlMs must be a positive integer: ${ttlMs}`);
  }
}
