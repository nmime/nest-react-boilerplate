export function isLockAcquired(result: unknown): boolean {
  return result === "OK" || result === true;
}
