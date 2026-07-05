export function getValidityMs(
  startedAt: number,
  ttlMs: number,
  driftFactor: number,
): number {
  const elapsedMs = Date.now() - startedAt;
  const driftMs = Math.ceil(ttlMs * driftFactor) + 2;
  return ttlMs - elapsedMs - driftMs;
}
