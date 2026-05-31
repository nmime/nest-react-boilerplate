import type { RedisClientLike } from "./redis-client.type";
import type { RedisMode } from "../const";

export interface RedisConfig {
  mode?: RedisMode | `${RedisMode}`;
  url?: string;
  hosts?: RedisHost[];
  password?: string;
  db?: number;
  sentinelGroupIdentifier?: string;
  keyPrefix?: string;
  lazyConnect?: boolean;
  client?: RedisClientLike;
  transientClient?: RedisClientLike;
}

export interface RedisHost {
  host: string;
  port: number;
}

export interface RedisConnectionConfig {
  mode: RedisMode;
  url?: string;
  hosts: RedisHost[];
  password?: string;
  db?: number;
  sentinelGroupIdentifier?: string;
  keyPrefix?: string;
  lazyConnect: boolean;
}
