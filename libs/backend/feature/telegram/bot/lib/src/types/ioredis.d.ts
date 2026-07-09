/**
 * Type shim for ioredis — satisfies @grammyjs/storage-redis type declarations
 * without adding ioredis as a runtime dependency.
 *
 * @grammyjs/storage-redis v2.5.1 re-exports `type { Redis as Client } from 'ioredis'`
 * but this project uses the `redis` v6 client. The shim only covers the surface
 * that the adapter actually calls at runtime: get, set, del, expire.
 */
declare module "ioredis" {
  export class Redis {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(...keys: string[]): Promise<unknown>;
    expire(key: string, seconds: number): Promise<unknown>;
  }
}
