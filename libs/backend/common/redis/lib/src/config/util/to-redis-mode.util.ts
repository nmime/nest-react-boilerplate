import { RedisMode } from '../../const';
import type { RedisConfig } from '../../type';

export function toRedisMode(value: RedisConfig['mode']): RedisMode {
  switch (value) {
    case RedisMode.Single:
      return RedisMode.Single;
    case RedisMode.Sentinel:
      return RedisMode.Sentinel;
    case RedisMode.Cluster:
      return RedisMode.Cluster;
    default:
      throw new Error(`Invalid Redis mode: ${value}`);
  }
}
