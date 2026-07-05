export function getLockKey(resource: string): string {
  return `redlock:${resource}`;
}
