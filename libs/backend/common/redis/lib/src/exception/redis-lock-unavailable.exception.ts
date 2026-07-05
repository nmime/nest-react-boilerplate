export class RedisLockUnavailableError extends Error {
  constructor(resource: string) {
    super(`Unable to acquire Redis lock for resource: ${resource}`);
    this.name = "RedisLockUnavailableError";
  }
}
